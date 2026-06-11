/**
 * PatternGenerator — generates timed sequences of fetch requests that
 * simulate realistic user behavior based on a BehaviorProfile.
 *
 * Each "burst" represents a user action (page load, scroll, API call batch).
 * Between bursts there is a think-time pause.
 */

class PatternGenerator {
  /**
   * @param {Object} profile - resolved BehaviorProfile
   */
  constructor(profile) {
    this.profile = profile;
  }

  /**
   * Pick a random value in [min, max] inclusive.
   */
  static _randomIn(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Pick a weighted random key from a templateMix.
   * templateMix = { templateKey: weight }
   */
  static _weightedPick(templateMix) {
    const entries = Object.entries(templateMix);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let random = Math.random() * totalWeight;
    for (const [key, weight] of entries) {
      random -= weight;
      if (random <= 0) return key;
    }
    return entries[entries.length - 1][0]; // fallback
  }

  /**
   * Generate a single burst: a set of concurrent-ish requests.
   *
   * @returns {Object[]} array of request descriptors { templateKey, template }
   */
  generateBurst() {
    const size = PatternGenerator._randomIn(
      this.profile.burstPattern.burstSize.min,
      this.profile.burstPattern.burstSize.max
    );

    const requests = [];
    for (let i = 0; i < size; i++) {
      const templateKey = PatternGenerator._weightedPick(
        this.profile.templateMix
      );
      const template = this.profile.templates[templateKey];
      if (template) {
        requests.push({ templateKey, template });
      }
    }
    return requests;
  }

  /**
   * Generate a full session of bursts for the given duration.
   *
   * @param {number} durationMs - total session duration
   * @returns {Object[]} array of { startOffset, requests }
   */
  generateSession(durationMs) {
    const bursts = [];
    let elapsed = 0;

    // Initial ramp-up: start slowly, increase concurrency
    const rampUpBursts = Math.ceil(
      this.profile.rampUpMs /
        PatternGenerator._randomIn(
          this.profile.burstPattern.pauseBetweenBursts.min,
          this.profile.burstPattern.pauseBetweenBursts.max
        )
    );

    let burstCount = 0;
    while (elapsed < durationMs) {
      const requests = this.generateBurst();

      // During ramp-up, limit burst size
      if (burstCount < rampUpBursts) {
        const ratio = (burstCount + 1) / rampUpBursts;
        const cappedSize = Math.max(1, Math.floor(requests.length * ratio));
        bursts.push({ startOffset: elapsed, requests: requests.slice(0, cappedSize) });
      } else {
        bursts.push({ startOffset: elapsed, requests });
      }

      burstCount++;
      const pause = PatternGenerator._randomIn(
        this.profile.burstPattern.pauseBetweenBursts.min,
        this.profile.burstPattern.pauseBetweenBursts.max
      );
      elapsed += pause;
    }

    return bursts;
  }

  /**
   * Pick a random URL from a template.
   */
  static pickUrl(template) {
    if (template.urls && template.urls.length > 0) {
      return template.urls[Math.floor(Math.random() * template.urls.length)];
    }
    return "https://httpbin.org/get";
  }

  /**
   * Build fetch init options from a template, with randomized delay.
   */
  buildFetchOptions(template, profile) {
    const delay = PatternGenerator._randomIn(
      profile.delayBetweenRequests.min,
      profile.delayBetweenRequests.max
    );

    return {
      url: PatternGenerator.pickUrl(template),
      init: {
        method: template.method || "GET",
        headers: template.headers || {},
        body: template.body
          ? typeof template.body === "function"
            ? template.body()
            : template.body
          : undefined,
      },
      delayMs: delay,
    };
  }
}

module.exports = { PatternGenerator };
