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
        const releasesUrl =
            "https://github.com/buggywhiletrue/client/releases/latest";
        await shell.openExternal(releasesUrl);
        MAIN_WINDOW.webContents.send("download-complete");
        return;
    }

    if (provider === "drive") {
        const driveUrl =
            "https://1drv.ms/u/c/7a395dedf680e456/IQQny9jvrPc9Qa_vrwV_GbxsAX67U6Pw9St0mwSKPVLl2Dk";
        await shell.openExternal(driveUrl);
        logger.info("Drive page opened in browser:", driveUrl);
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

const CLIENT_LATEST_URL =
    "https://raw.githubusercontent.com/buggywhiletrue/client/main/latest.json";

interface ClientLatest {
    schemaVersion: number;
    clientVersion: string;
    releaseTag: string;
    manifest: {
        url: string;
        size: number;
        sha256: string;
    };
    releaseUrl: string;
}

interface ClientAsset {
    name: string;
    size: number;
    sha256: string;
    url: string;
}

interface ClientFile {
    path: string;
    size: number;
    sha256: string;
    delivery: "file" | "parts";
    assets: ClientAsset[];
}

interface BundleFile {
    path: string;
    size: number;
    sha256: string;
    installMode: "replace" | "ifMissing";
}

interface ClientBundle {
    id: string;
    asset: string;
    size: number;
    sha256: string;
    url: string;
    files: BundleFile[];
}

interface ClientManifest {
    schemaVersion: number;
    clientVersion: string;
    releaseTag: string;
    totalDownloadBytes: number;
    files: ClientFile[];
    bundles: ClientBundle[];
    installIfMissing: string[];
    delete: string[];
}

const resolveClientPath = (clientPath: string, relativePath: string) => {
    const resolved = path.resolve(clientPath, relativePath);
    const root = path.resolve(clientPath) + path.sep;
    if (!resolved.startsWith(root)) {
        throw new Error(`Unsafe client path: ${relativePath}`);
    }
    return resolved;
};

const normalizeHash = (hash: string) => hash.toLowerCase();

const hashFile = async (filePath: string) => {
    const hash = createHash("sha256");
    await pipeline(fs.createReadStream(filePath), hash);
    return hash.digest("hex");
};

const isCurrentFile = async (filePath: string, file: ClientFile) => {
    try {
        if (fs.statSync(filePath).size !== file.size) return false;
        return (
            normalizeHash(await hashFile(filePath)) ===
            normalizeHash(file.sha256)
        );
    } catch {
        return false;
    }
};

const isCurrentBundleFile = async (filePath: string, file: BundleFile) =>
    isCurrentFile(filePath, {
        ...file,
        delivery: "file",
        assets: [],
    });

const downloadAsset = async (
    asset: ClientAsset,
    tempPath: string,
    onData: (bytes: number) => void,
) => {
    const response = await axios({
        method: "GET",
        url: asset.url,
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

    const actualDigest = hash.digest("hex");
    if (normalizeHash(actualDigest) !== normalizeHash(asset.sha256)) {
        throw new Error(`Checksum mismatch: ${asset.name}`);
    }
};

const getJson = async <T>(url: string) => {
    const response = await axios.get<T>(url, {
        timeout: 60 * 1000,
        headers: { Accept: "application/json" },
        responseType: "json",
    });
    return response.data;
};

const installBundle = async (
    bundle: ClientBundle,
    zipPath: string,
    clientPath: string,
) => {
    const archive = await unzipper.Open.file(zipPath);
    const entries = new Map(
        archive.files
            .filter((entry) => entry.type === "File")
            .map((entry) => [entry.path.replace(/\\/g, "/"), entry]),
    );

    for (const file of bundle.files) {
        const destination = resolveClientPath(clientPath, file.path);
        if (file.installMode === "ifMissing" && fs.existsSync(destination)) {
            continue;
        }

        const entry = entries.get(file.path.replace(/\\/g, "/"));
        if (!entry) {
            throw new Error(`Missing file in ${bundle.asset}: ${file.path}`);
        }

        const partialPath = `${destination}.partial`;
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath);
        await pipeline(entry.stream(), fs.createWriteStream(partialPath));

        if (!(await isCurrentBundleFile(partialPath, file))) {
            throw new Error(`Bundle file checksum mismatch: ${file.path}`);
        }
        if (fs.existsSync(destination)) fs.unlinkSync(destination);
        fs.renameSync(partialPath, destination);
    }
};

const GithubClient = async (clientPath: string) => {
    if (!clientPath) {
        throw new Error("Client install path is not configured");
    }
    fs.mkdirSync(clientPath, { recursive: true });

    const latest = await getJson<ClientLatest>(
        `${CLIENT_LATEST_URL}?t=${Date.now()}`,
    );
    if (latest.schemaVersion !== 1) {
        throw new Error(`Unsupported latest schema: ${latest.schemaVersion}`);
    }

    const manifestResponse = await axios.get<ArrayBuffer>(latest.manifest.url, {
        timeout: 60 * 1000,
        responseType: "arraybuffer",
    });
    const manifestBuffer = Buffer.from(manifestResponse.data);
    const manifestHash = createHash("sha256")
        .update(manifestBuffer)
        .digest("hex");
    if (normalizeHash(manifestHash) !== normalizeHash(latest.manifest.sha256)) {
        throw new Error("Client manifest checksum mismatch");
    }
    const manifest = JSON.parse(
        manifestBuffer.toString("utf-8"),
    ) as ClientManifest;
    if (
        manifest.schemaVersion !== 1 ||
        manifest.clientVersion !== latest.clientVersion ||
        manifest.releaseTag !== latest.releaseTag
    ) {
        throw new Error("Client manifest does not match latest.json");
    }

    const cachePath = path.join(clientPath, ".launcher-downloads");
    fs.mkdirSync(cachePath, { recursive: true });
    const filesToInstall: ClientFile[] = [];
    for (const file of manifest.files) {
        const destination = resolveClientPath(clientPath, file.path);
        const preserveExisting =
            manifest.installIfMissing.includes(file.path) &&
            fs.existsSync(destination);
        if (!preserveExisting && !(await isCurrentFile(destination, file))) {
            filesToInstall.push(file);
        }
    }
    const bundlesToInstall: ClientBundle[] = [];
    for (const bundle of manifest.bundles) {
        let needsInstall = false;
        for (const file of bundle.files) {
            const destination = resolveClientPath(clientPath, file.path);
            if (
                file.installMode === "ifMissing" &&
                fs.existsSync(destination)
            ) {
                continue;
            }
            if (!(await isCurrentBundleFile(destination, file))) {
                needsInstall = true;
                break;
            }
        }
        if (needsInstall) bundlesToInstall.push(bundle);
    }
    const fileDownloadBytes = filesToInstall.reduce(
        (sum, file) =>
            sum +
            file.assets.reduce((assetSum, asset) => assetSum + asset.size, 0),
        0,
    );
    const totalBytes =
        fileDownloadBytes +
        bundlesToInstall.reduce((sum, bundle) => sum + bundle.size, 0);
    const startedAt = Date.now();
    let downloadedBytes = 0;

    const updateProgress = (assetName: string, bytes: number) => {
        downloadedBytes += bytes;
        downloadProgress = totalBytes
            ? (downloadedBytes / totalBytes) * 100
            : 100;
        currentFileDownload = assetName;
        const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 1);
        const bytesPerSecond = downloadedBytes / elapsedSeconds;
        downloadEta = Math.max(
            Math.round((totalBytes - downloadedBytes) / bytesPerSecond),
            0,
        );
    };

    try {
        for (const file of filesToInstall) {
            const destination = resolveClientPath(clientPath, file.path);
            const partialPath = `${destination}.partial`;
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            if (fs.existsSync(partialPath)) fs.unlinkSync(partialPath);

            for (const asset of file.assets) {
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

            if (!(await isCurrentFile(partialPath, file))) {
                throw new Error(
                    `Installed file checksum mismatch: ${file.path}`,
                );
            }
            if (fs.existsSync(destination)) fs.unlinkSync(destination);
            fs.renameSync(partialPath, destination);
        }

        for (const bundle of bundlesToInstall) {
            const asset: ClientAsset = {
                name: bundle.asset,
                size: bundle.size,
                sha256: bundle.sha256,
                url: bundle.url,
            };
            const tempPath = path.join(
                cachePath,
                bundle.asset.replace(/[^a-z0-9._-]/gi, "_"),
            );
            await downloadAsset(asset, tempPath, (bytes) =>
                updateProgress(asset.name, bytes),
            );
            await installBundle(bundle, tempPath, clientPath);
            fs.unlinkSync(tempPath);
        }

        for (const relativePath of manifest.delete) {
            const obsoletePath = resolveClientPath(clientPath, relativePath);
            fs.rmSync(obsoletePath, { recursive: true, force: true });
        }

        downloadProgress = 100;
        downloadEta = 0;
        logger.info(`Installed GitHub client release ${manifest.releaseTag}`);
    } finally {
        fs.rmSync(cachePath, { recursive: true, force: true });
    }
};
