import { app, ipcMain, shell } from "electron";

import path from "path";
import fs from "fs";
import axios from "axios";
import unzipper from "unzipper";

import logger from "electron-log/main";

import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { t } from "i18next";
import { APP_CONFIG } from "./config";
import { MAIN_WINDOW } from "./app";
import { pipeline } from "stream/promises";
import { createHash } from "crypto";

let downloadProgress = 0;
let currentFileDownload = "";
let downloadEta = -1;

ipcMain.handle("get-download-progress", async () => {
    return downloadProgress;
});

ipcMain.handle("get-download-file", async () => {
    return currentFileDownload;
});

ipcMain.handle("get-download-eta", async () => {
    return downloadEta;
});

ipcMain.handle("download-client", async (_, provider) => {
    downloadProgress = 0;
    currentFileDownload = "";
    downloadEta = -1;

    if (provider === "xml") {
        const CLIENT_URL =
            "aHR0cHM6Ly9naXRodWIuY29tL2J1Z2d5d2hpbGV0cnVlL1htbC5naXQ=";

        // Decode the URL
        const decodedUrl = Buffer.from(CLIENT_URL, "base64").toString("utf-8");

        logger.info("Direct download link:", decodedUrl);

        await shell.openExternal(decodedUrl);
        logger.info("Direct download link opened in browser:", decodedUrl);
        MAIN_WINDOW.webContents.send("download-complete");

        return new Promise<void>((resolve) => {
            resolve();
        });
    }

    if (provider === "automatic") {
        try {
            await GithubClient(APP_CONFIG.clientPath);
            MAIN_WINDOW.webContents.send("download-complete");
        } catch (err) {
            logger.error("Automatic client download failed", err);
            MAIN_WINDOW.webContents.send("download-error", err);
            throw err;
        }
        return;
    }

    if (provider === "github-releases") {
        const releasesUrl = "https://github.com/buggywhiletrue/client/releases";
        await shell.openExternal(releasesUrl);
        MAIN_WINDOW.webContents.send("download-complete");
        return;
    }

    if (provider === "drive") {
        const CLIENT_URL =
            "aHR0cHM6Ly8xZHJ2Lm1zL3UvYy83YTM5NWRlZGY2ODBlNDU2L0lRUW55OWp2clBjOVFhX3Zyd1ZfR2J4c0FYNjdVNlB3OVN0MG13U0tQVkxsMkRrP2Rvd25sb2FkPTE=";

        // Decode the URL
        const decodedUrl = Buffer.from(CLIENT_URL, "base64").toString("utf-8");

        logger.info("Direct download link:", decodedUrl);

        await shell.openExternal(decodedUrl);
        logger.info("Direct download link opened in browser:", decodedUrl);
        MAIN_WINDOW.webContents.send("download-complete");

        return;
    }

    return new Promise<void>((resolve, reject) => {
        logger.error("Download client not supported for provider", provider);
        reject(new Error("Download client not supported for provider"));
        MAIN_WINDOW.webContents.send("download-complete");
    });
});

const APP_ID = 560380;
const DEPOT_ID = 560381;
const MANIFEST_ID = "3190888022545443868";

const DOWNLOADER_EXE = app.isPackaged
    ? path.join(process.resourcesPath, "./DepotDownloaderMod.dll")
    : path.join(__dirname, "../../src/downloader/DepotDownloaderMod.dll");

const MANIFEST_INFO = app.isPackaged
    ? path.join(process.resourcesPath, "./560381_3190888022545443868.manifest")
    : path.join(
          __dirname,
          "../../src/downloader/560381_3190888022545443868.manifest",
      );

const DEPOT_KEY = app.isPackaged
    ? path.join(process.resourcesPath, "./depot.key")
    : path.join(__dirname, "../../src/downloader/depot.key");
const KEY = Buffer.from(
    "9bdb5693b8cbe239bd87eb147abacb8ae4aa446744d1ca4a323bac611174bc8c",
    "hex",
);

let ActiveDownloadProcess: ChildProcessWithoutNullStreams | null;

export const KillDownloadClient = () => {
    if (ActiveDownloadProcess) {
        ActiveDownloadProcess.kill();
        ActiveDownloadProcess = null;
    }
};

const hasDotnet = () => {
    return new Promise((resolve, reject) => {
        const dotnetRuntimesProcess = spawn("dotnet", ["--list-runtimes"]);
        let runtimeListOutput = "";

        dotnetRuntimesProcess.stdout.on("data", (data) => {
            runtimeListOutput += data.toString();
        });

        dotnetRuntimesProcess.on("close", (code) => {
            if (code !== 0) {
                reject("Error checking .NET runtimes");
                return;
            }

            // Check if any installed runtimes are 9.0 or higher
            const runtimeLines = runtimeListOutput.trim().split("\n");
            let hasDotnet9OrHigher = false;

            runtimeLines.forEach((line) => {
                const runtimeVersion = line.split(" ")[1];
                if (runtimeVersion) {
                    const [major, minor] = runtimeVersion
                        .split(".")
                        .map(Number);
                    if (major > 9 || (major === 9 && minor >= 0)) {
                        hasDotnet9OrHigher = true;
                    }
                }
            });

            if (hasDotnet9OrHigher) {
                resolve(true);
            } else {
                reject();
            }
        });
    });
};

export const DownloadClient = async (
    clientPath: string,
    cb: (err: Error) => void,
) => {
    if (ActiveDownloadProcess) {
        logger.error(
            t("downloader.already.running", "Download process already running"),
        );
        return;
    }

    try {
        await hasDotnet();
    } catch (err) {
        cb(
            new Error(
                t(
                    "downloader.dotnet.not.installed",
                    ".NET 9.0+ is not installed",
                ),
            ),
        );
        shell.openExternal(
            "https://dotnet.microsoft.com/en-us/download/dotnet/9.0/runtime?cid=getdotnetcore",
        );
        return;
    }

    const args = [
        `${DOWNLOADER_EXE}`,
        `-app`,
        APP_ID.toString(),
        `-depot`,
        DEPOT_ID.toString(),
        `-depotkeys`,
        DEPOT_KEY,
        `-manifest`,
        MANIFEST_ID,
        `-manifestfile`,
        MANIFEST_INFO,
        `-dir`,
        clientPath,
        `-validate`,
    ];

    // Download the client
    ActiveDownloadProcess = spawn(`dotnet`, args, {});

    const startTime = Date.now();
    let lastPercent = 0;
    const percentDiffs = [] as { diff: number; time: number }[];

    const etaInterval = setInterval(() => {
        const timeElapsed = Date.now() - startTime;

        // Calculate the average download speed
        const averageSpeed =
            percentDiffs.reduce((acc, curr) => acc + curr.diff, 0) /
            percentDiffs.length;

        const timeRemaining = Math.round(100 / averageSpeed);

        downloadEta = Math.max(
            Math.round(timeRemaining - timeElapsed / 1000),
            0,
        );
    }, 1000);

    const p = new Promise<void>((resolve, reject) => {
        if (!ActiveDownloadProcess) {
            reject(
                new Error(
                    t(
                        "downloader.download.process.not.found",
                        "Download process not found",
                    ),
                ),
            );
            return;
        }

        ActiveDownloadProcess.stdout.on("data", (data) => {
            let lines = data.toString().split("\n");

            if (lines.length === 0) lines = [data.toString()];

            for (const line of lines) {
                if (line.match(/(\d+)\.(\d+)%/)) {
                    // download progress
                    const match = line.match(/(\d+\.\d+)%/);
                    const percent = parseFloat(match[1]);
                    downloadProgress = percent;

                    currentFileDownload = line.replace(clientPath, "");

                    const diff = percent - lastPercent;
                    lastPercent = percent;
                    percentDiffs.push({
                        diff,
                        time: Date.now(),
                    });
                } else if (line.trim() !== "") {
                    // setDoiwnl(line.replace(clientPath, ""));
                    logger.info(line);
                }
            }
        });

        ActiveDownloadProcess.stderr.on("data", (data) => {
            console.error(`stderr: ${data}`);
            reject(new Error(data.toString()));
        });

        ActiveDownloadProcess.on("close", (code) => {
            console.log(`Child process exited with code ${code}`);

            clearInterval(etaInterval);
            if (code === 0) {
                resolve();
                return;
            }

            cb(new Error("Download process exited with code " + code));
            resolve();
        });
    });

    await p;

    ActiveDownloadProcess = null;
};

const GITHUB_LATEST_RELEASE_API =
    "https://api.github.com/repos/buggywhiletrue/client/releases/latest";

interface GithubReleaseAsset {
    name: string;
    size: number;
    digest?: string;
    browser_download_url: string;
}

interface GithubRelease {
    tag_name: string;
    assets: GithubReleaseAsset[];
}

const resolveClientPath = (clientPath: string, assetName: string) => {
    const relativePath = assetName.split("__").join(path.sep);
    const resolved = path.resolve(clientPath, relativePath);
    const root = path.resolve(clientPath) + path.sep;
    if (!resolved.startsWith(root)) {
        throw new Error(`Unsafe release asset path: ${assetName}`);
    }
    return resolved;
};

const downloadAsset = async (
    asset: GithubReleaseAsset,
    tempPath: string,
    onData: (bytes: number) => void,
) => {
    const response = await axios({
        method: "GET",
        url: asset.browser_download_url,
        responseType: "stream",
        timeout: 60 * 60 * 1000,
        maxRedirects: 10,
        headers: { Accept: "application/octet-stream" },
    });
    const hash = createHash("sha256");
    response.data.on("data", (chunk: Buffer) => {
        hash.update(chunk);
        onData(chunk.length);
    });
    await pipeline(response.data, fs.createWriteStream(tempPath));

    if (asset.digest?.startsWith("sha256:")) {
        const actualDigest = `sha256:${hash.digest("hex")}`;
        if (actualDigest !== asset.digest) {
            throw new Error(`Checksum mismatch: ${asset.name}`);
        }
    }
};

const extractZip = async (zipPath: string, clientPath: string) => {
    await fs
        .createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: clientPath }))
        .promise();
};

const GithubClient = async (clientPath: string) => {
    if (!clientPath) {
        throw new Error("Client install path is not configured");
    }
    fs.mkdirSync(clientPath, { recursive: true });

    const releaseResponse = await axios.get<GithubRelease>(
        GITHUB_LATEST_RELEASE_API,
        { headers: { Accept: "application/vnd.github+json" } },
    );
    const release = releaseResponse.data;
    if (!release.assets.length) {
        throw new Error(`No assets found in release ${release.tag_name}`);
    }

    const cachePath = path.join(clientPath, ".launcher-downloads");
    fs.mkdirSync(cachePath, { recursive: true });
    const totalBytes = release.assets.reduce(
        (sum, asset) => sum + asset.size,
        0,
    );
    const startedAt = Date.now();
    let downloadedBytes = 0;

    const updateProgress = (assetName: string, bytes: number) => {
        downloadedBytes += bytes;
        downloadProgress = (downloadedBytes / totalBytes) * 100;
        currentFileDownload = assetName;
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1);
        const bytesPerSecond = downloadedBytes / elapsedSeconds;
        downloadEta = Math.max(
            Math.round((totalBytes - downloadedBytes) / bytesPerSecond),
            0,
        );
    };

    const multipartGroups = new Map<string, GithubReleaseAsset[]>();
    const regularAssets: GithubReleaseAsset[] = [];
    for (const asset of release.assets) {
        const partMatch = asset.name.match(/^(.*)\.part(\d+)$/i);
        if (!partMatch) {
            regularAssets.push(asset);
            continue;
        }
        const group = multipartGroups.get(partMatch[1]) ?? [];
        group.push(asset);
        multipartGroups.set(partMatch[1], group);
    }

    try {
        for (const asset of regularAssets) {
            const tempPath = path.join(
                cachePath,
                asset.name.replace(/[^a-z0-9._-]/gi, "_"),
            );
            await downloadAsset(asset, tempPath, (bytes) =>
                updateProgress(asset.name, bytes),
            );

            if (asset.name.toLowerCase().endsWith(".zip")) {
                await extractZip(tempPath, clientPath);
            } else {
                const destination = resolveClientPath(clientPath, asset.name);
                fs.mkdirSync(path.dirname(destination), { recursive: true });
                fs.renameSync(tempPath, destination);
            }
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }

        for (const [baseName, parts] of multipartGroups) {
            parts.sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true }),
            );
            const destination = resolveClientPath(clientPath, baseName);
            const partialPath = `${destination}.partial`;
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath);

            for (const asset of parts) {
                const tempPath = path.join(
                    cachePath,
                    asset.name.replace(/[^a-z0-9._-]/gi, "_"),
                );
                await downloadAsset(asset, tempPath, (bytes) =>
                    updateProgress(asset.name, bytes),
                );
                await pipeline(
                    fs.createReadStream(tempPath),
                    fs.createWriteStream(partialPath, { flags: "a" }),
                );
                fs.unlinkSync(tempPath);
            }

            if (fs.existsSync(destination)) fs.unlinkSync(destination);
            fs.renameSync(partialPath, destination);
        }

        downloadProgress = 100;
        downloadEta = 0;
        logger.info(`Installed GitHub client release ${release.tag_name}`);
    } finally {
        fs.rmSync(cachePath, { recursive: true, force: true });
    }
};
