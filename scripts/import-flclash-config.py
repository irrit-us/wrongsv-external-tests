#!/usr/bin/env python3
"""
Pre-populate FlClash's local profile database with a config file.

FlClash only binds its local proxy port after a profile is selected and
applied. Writing `config.yaml` alone is not enough. This importer mirrors the
minimum state FlClash expects on startup:

1. copy the Clash/Mihomo config into `<data-dir>/profiles/<id>.yaml`
2. insert a matching row into `database.sqlite`
3. set `currentProfileId` in `shared_preferences.json`
"""

import argparse
import json
import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path

import yaml


def get_data_dir():
    xdg_data = os.environ.get("XDG_DATA_HOME", os.path.expanduser("~/.local/share"))
    return os.path.join(xdg_data, "FlClash")


def load_yaml(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def build_patch_config(raw_cfg):
    return {
        "mixed-port": int(raw_cfg.get("mixed-port") or raw_cfg.get("port") or 7890),
        "socks-port": int(raw_cfg.get("socks-port") or 0),
        "port": int(raw_cfg.get("port") or 0),
        "redir-port": int(raw_cfg.get("redir-port") or 0),
        "tproxy-port": int(raw_cfg.get("tproxy-port") or 0),
        "mode": raw_cfg.get("mode", "rule"),
        "allow-lan": bool(raw_cfg.get("allow-lan", False)),
        "log-level": raw_cfg.get("log-level", "error"),
        "ipv6": bool(raw_cfg.get("ipv6", False)),
        "find-process-mode": raw_cfg.get("find-process-mode", "always"),
        "keep-alive-interval": int(raw_cfg.get("keep-alive-interval", 30)),
        "unified-delay": bool(raw_cfg.get("unified-delay", True)),
        "tcp-concurrent": bool(raw_cfg.get("tcp-concurrent", True)),
        "tun": {
            "enable": False,
            "device": "FlClash",
            "auto-route": False,
            "stack": "mixed",
            "dns-hijack": ["any:53"],
            "route-address": [],
        },
        "dns": {
            "enable": True,
            "listen": "0.0.0.0:1053",
            "prefer-h3": False,
            "use-hosts": True,
            "use-system-hosts": True,
            "respect-rules": False,
            "ipv6": False,
            "default-nameserver": ["223.5.5.5"],
            "enhanced-mode": "fake-ip",
            "fake-ip-range": "198.18.0.1/16",
            "fake-ip-filter": ["*.lan", "localhost.ptlogin2.qq.com"],
            "nameserver-policy": {},
            "nameserver": ["https://doh.pub/dns-query", "https://dns.alidns.com/dns-query"],
            "fallback": ["tls://8.8.4.4", "tls://1.1.1.1"],
            "proxy-server-nameserver": ["https://doh.pub/dns-query"],
            "fallback-filter": {
                "geoip": True,
                "geoip-code": "CN",
                "geosite": [],
                "ipcidr": ["240.0.0.0/4"],
                "domain": ["+.google.com", "+.facebook.com", "+.youtube.com"],
            },
        },
        "geox-url": {
            "mmdb": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb",
            "asn": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb",
            "geoip": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat",
            "geosite": "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
        },
        "geodata-loader": "memconservative",
        "global-ua": None,
        "external-controller": "",
        "hosts": {},
    }


def default_flutter_config(profile_id, patch_config):
    return {
        "currentProfileId": profile_id,
        "overrideDns": False,
        "hotKeyActions": [],
        "appSettingProps": {
            "disclaimerAccepted": True,
            "autoLaunch": False,
            "silentLaunch": False,
            "autoRun": False,
            "openLogs": False,
            "closeConnections": True,
            "testUrl": "https://www.gstatic.com/generate_204",
            "isAnimateToPage": True,
            "autoCheckUpdate": True,
            "showLabel": False,
            "crashlyticsTip": False,
            "crashlytics": False,
            "minimizeOnExit": True,
            "hidden": False,
            "developerMode": False,
            "restoreStrategy": "compatible",
            "showTrayTitle": True,
        },
        "networkProps": {
            "systemProxy": True,
            "bypassDomain": [
                "localhost",
                "*.local",
                "127.*",
                "10.*",
                "172.16.*",
                "172.17.*",
                "172.18.*",
                "172.19.*",
                "172.2*",
                "172.30.*",
                "172.31.*",
                "192.168.*",
            ],
            "routeMode": "config",
            "autoSetSystemDns": True,
            "appendSystemDns": False,
        },
        "vpnProps": {
            "enable": True,
            "systemProxy": True,
            "ipv6": False,
            "allowBypass": True,
            "dnsHijacking": False,
            "accessControlProps": {
                "enable": False,
                "mode": "rejectSelected",
                "acceptList": [],
                "rejectList": [],
                "sort": "none",
                "isFilterSystemApp": True,
                "isFilterNonInternetApp": True,
            },
        },
        "themeProps": {},
        "proxiesStyleProps": {},
        "windowProps": {},
        "patchClashConfig": patch_config,
        "excludeSSIDs": [],
    }


def ensure_profiles_table(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER NOT NULL PRIMARY KEY,
            label TEXT NOT NULL,
            current_group_name TEXT,
            url TEXT NOT NULL,
            last_update_date INTEGER,
            overwrite_type TEXT NOT NULL,
            script_id INTEGER,
            auto_update_duration_millis INTEGER NOT NULL,
            subscription_info TEXT,
            auto_update INTEGER NOT NULL,
            selected_map TEXT NOT NULL,
            unfold_set TEXT NOT NULL,
            "order" INTEGER
        )
        """
    )


def main():
    parser = argparse.ArgumentParser(description="Import a config into FlClash's profile database")
    parser.add_argument("--config", required=True, help="Path to the Clash/Mihomo config file")
    parser.add_argument("--data-dir", default=None, help="FlClash data directory")
    parser.add_argument("--profile-name", default="Test Profile", help="Profile display name")
    args = parser.parse_args()

    config_path = Path(args.config).expanduser().resolve()
    if not config_path.is_file():
        print(f"ERROR: Config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    raw_cfg = load_yaml(config_path)
    data_dir = Path(args.data_dir or get_data_dir()).expanduser().resolve()
    profiles_dir = data_dir / "profiles"
    profiles_dir.mkdir(parents=True, exist_ok=True)

    profile_id = int(time.time() * 1000)
    config_dest = profiles_dir / f"{profile_id}.yaml"
    shutil.copy2(config_path, config_dest)

    db_path = data_dir / "database.sqlite"
    conn = sqlite3.connect(db_path)
    ensure_profiles_table(conn)
    conn.execute("DELETE FROM profiles")
    conn.execute(
        """
        INSERT INTO profiles (
            id, label, current_group_name, url, last_update_date,
            overwrite_type, script_id, auto_update_duration_millis,
            subscription_info, auto_update, selected_map, unfold_set, "order"
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            profile_id,
            args.profile_name,
            None,
            "",
            int(time.time() * 1000),
            "standard",
            None,
            86400000,
            None,
            0,
            "{}",
            "[]",
            0,
        ),
    )
    conn.commit()
    conn.close()

    prefs_path = data_dir / "shared_preferences.json"
    prefs = {}
    if prefs_path.exists():
        with prefs_path.open("r", encoding="utf-8") as handle:
            prefs = json.load(handle)

    raw_config = prefs.get("flutter.config")
    if raw_config:
        flutter_config = json.loads(raw_config)
    else:
        flutter_config = default_flutter_config(profile_id, build_patch_config(raw_cfg))

    flutter_config["currentProfileId"] = profile_id
    flutter_config["patchClashConfig"] = build_patch_config(raw_cfg)
    app_setting = flutter_config.setdefault("appSettingProps", {})
    app_setting["disclaimerAccepted"] = True

    prefs["flutter.config"] = json.dumps(flutter_config, separators=(",", ":"))
    prefs["flutter.version"] = prefs.get("flutter.version", 1)

    with prefs_path.open("w", encoding="utf-8") as handle:
        json.dump(prefs, handle, separators=(",", ":"))

    print(f"Config written to: {config_dest}")
    print(f"Database ready: {db_path}")
    print(f"Profile '{args.profile_name}' (ID: {profile_id}) is active")


if __name__ == "__main__":
    main()
