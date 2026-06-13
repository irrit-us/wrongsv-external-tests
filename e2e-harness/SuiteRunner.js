const fs = require("fs");
const path = require("path");
const { ProxyFetchClient, BenchmarkRunner } = require("../proxy-testing-framework/traffic-simulator");
const { UserSimulator } = require("../proxy-testing-framework/user-simulator");
const {
  buildClientRuntimeConfig,
  buildTargetCatalog,
  rawConfigFormat,
  runtimeConfigPath,
} = require("./config-builders");
const { createClientRunner } = require("./client-runners");
const { WrongsvMetricsClient } = require("./metrics");
const { LocalTargetServer, WrongsvServer } = require("./servers");

const DEFAULT_TRAFFIC_PROFILES = [
  "local-general",
  "local-download-heavy",
  "local-session-churn",
];

const DEFAULT_USER_BEHAVIORS = [
  "web-browsing",
  "download-heavy",
  "rapid-switching",
  "form-interaction",
];

async function runCompatibilityProbe(proxyUrl, baseUrl) {
  const client = new ProxyFetchClient(proxyUrl, {
    timeout: 10000,
  });
  const targets = [
    `${baseUrl}/api/status`,
    `${baseUrl}/page/news`,
    `${baseUrl}/download/65536`,
  ];
  const results = [];
  for (const url of targets) {
    try {
      const response = await client.fetch(url);
      results.push({
        url,
        status: response.status,
        ttfb: response.timing.ttfb,
        total: response.timing.total,
        bodySize: response.timing.bodySize,
      });
    } catch (error) {
      results.push({
        url,
        status: 0,
        error: error.message,
      });
    }
  }
  return {
    ok: results.every((item) => item.status >= 200 && item.status < 400),
    results,
  };
}

class SuiteRunner {
  constructor(options = {}) {
    this.repoRoot = options.repoRoot || path.resolve(__dirname, "..");
    this.wrongsvRepo =
      options.wrongsvRepo || path.resolve(this.repoRoot, "..", "wrongsv");
    this.client = options.client;
    this.scenario = options.scenario || null;
    this.wrongsvConfig = path.resolve(
      options.wrongsvConfig || path.join(this.wrongsvRepo, "configs", "tls-vision.toml")
    );
    this.outputDir =
      options.outputDir ||
      path.join(
        this.repoRoot,
        "results",
        `${this.client}-suite-${new Date().toISOString().replace(/[:.]/g, "-")}`
      );
    this.listenPort = options.listenPort || 50443;
    this.targetPort = options.targetPort || 3099;
    this.metricsPort = options.metricsPort || null;
    this.serverHost = options.serverHost || "127.0.0.1";
    this.serverName = options.serverName || "localhost";
    this.trafficDuration = options.trafficDuration || 12000;
    this.userDuration = options.userDuration || 12000;
    this.trafficProfiles = options.trafficProfiles || DEFAULT_TRAFFIC_PROFILES;
    this.userBehaviors = options.userBehaviors || DEFAULT_USER_BEHAVIORS;
  }

  async run() {
    fs.mkdirSync(this.outputDir, { recursive: true });

    const localServer = new LocalTargetServer({
      repoRoot: this.repoRoot,
      port: this.targetPort,
      outputDir: this.outputDir,
    });
    const wrongsv = new WrongsvServer({
      repoRoot: this.repoRoot,
      wrongsvRepo: this.wrongsvRepo,
      baseConfigPath: this.wrongsvConfig,
      outputDir: this.outputDir,
      listenPort: this.listenPort,
      listenProtocol: this.scenario?.listenProtocol,
      metricsPort: this.metricsPort,
      serverHost: this.serverHost,
      serverName: this.serverName,
    });

    let clientRunner;
    const metricsClient = this.metricsPort
      ? new WrongsvMetricsClient({
          url: `http://127.0.0.1:${this.metricsPort}/metrics`,
        })
      : null;

    try {
      await localServer.start();
      await wrongsv.start();

      const needsGeneratedConfig =
        !this.scenario ||
        this.scenario.family === "vless" ||
        this.scenario.family === "vmess";
      const rawClientConfig = needsGeneratedConfig
        ? wrongsv.generateClientConfig(rawConfigFormat(this.client), {
            clientName: `${this.client}-wrongsv`,
          })
        : null;
      const runtimeConfig = buildClientRuntimeConfig({
        client: this.client,
        rawConfig: rawClientConfig,
        clientName: `${this.client}-wrongsv`,
        scenario: this.scenario,
        serverPort: this.listenPort,
      });
      const configPath = runtimeConfigPath(
        this.outputDir,
        this.client,
        runtimeConfig.extension
      );
      fs.writeFileSync(configPath, runtimeConfig.content, "utf8");

      clientRunner = createClientRunner({
        repoRoot: this.repoRoot,
        client: this.client,
        configPath,
        outputDir: this.outputDir,
      });

      const launch = await clientRunner.start();
      const targetCatalog = buildTargetCatalog(`http://127.0.0.1.nip.io:${this.targetPort}`);

      const compatibilityBefore = metricsClient ? await metricsClient.snapshot() : null;
      const compatibility = await runCompatibilityProbe(
        clientRunner.getProxyUrl(),
        localServer.baseUrl
      );
      const compatibilityAfter = metricsClient ? await metricsClient.snapshot() : null;

      const trafficReports = [];
      for (const profile of this.trafficProfiles) {
        const before = metricsClient ? await metricsClient.snapshot() : null;
        const report = await new BenchmarkRunner({
          proxy: clientRunner.getProxyUrl(),
          profile,
          duration: this.trafficDuration,
          baseUrl: localServer.baseUrl,
        }).run();
        const after = metricsClient ? await metricsClient.snapshot() : null;
        trafficReports.push({
          profile,
          report,
          metricsDelta: WrongsvMetricsClient.delta(before, after),
        });
      }

      const userReports = [];
      for (const behavior of this.userBehaviors) {
        const before = metricsClient ? await metricsClient.snapshot() : null;
        const simulator = new UserSimulator({
          proxy: clientRunner.getProxyUrl(),
          behavior,
          duration: this.userDuration,
          recordNetwork: true,
          headless: true,
          targets: targetCatalog,
          proxyLocalTargets: true,
        });
        try {
          const report = await simulator.run();
          const after = metricsClient ? await metricsClient.snapshot() : null;
          userReports.push({
            behavior,
            report,
            metricsDelta: WrongsvMetricsClient.delta(before, after),
          });
        } finally {
          await simulator.close();
        }
      }

      const result = {
        client: this.client,
        generatedAt: new Date().toISOString(),
        wrongsv: {
          config: this.wrongsvConfig,
          runtimeConfig: wrongsv.runtimeConfigPath,
          logPath: wrongsv.logPath,
          metricsPort: this.metricsPort,
          serverHost: this.serverHost,
          serverName: this.serverName,
          listenPort: this.listenPort,
        },
        targetServer: {
          baseUrl: localServer.baseUrl,
          logPath: localServer.logPath,
        },
        clientRuntimeConfig: configPath,
        launch,
        compatibility: {
          ...compatibility,
          metricsDelta: WrongsvMetricsClient.delta(
            compatibilityBefore,
            compatibilityAfter
          ),
        },
        traffic: trafficReports,
        userBehavior: userReports,
      };

      fs.writeFileSync(
        path.join(this.outputDir, "report.json"),
        JSON.stringify(result, null, 2),
        "utf8"
      );

      return result;
    } finally {
      if (clientRunner) {
        await clientRunner.stop();
      }
      await wrongsv.stop();
      await localServer.stop();
    }
  }
}

module.exports = {
  SuiteRunner,
};
