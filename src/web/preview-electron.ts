import type { ServerEntry } from "../app/config";

import en from "../locales/en/translation.json";
import jp from "../locales/jp/translation.json";
import kr from "../locales/kr/translation.json";
import ptbr from "../locales/ptbr/translation.json";
import zhcn from "../locales/zhcn/translation.json";
import zhtw from "../locales/zhtw/translation.json";

const translations: Record<string, Record<string, string>> = {
    en,
    jp,
    kr,
    ptbr,
    zhcn,
    zhtw,
};

let previewConfig = {
    language: "kr",
    clientPath: "C:\\MapleStory2",
    servers: [] as ServerEntry[],
    enableConsole: false,
    autoLogin: false,
    audioEnabled: false,
    audioVolume: 25,
    modDeveloper: false,
};

let previewServers: ServerEntry[] = [
    {
        id: "preview-cherry",
        name: "Cherry",
        ip: "127.0.0.1",
        port: 20001,
        lastPlayed: 5,
        hidden: false,
        online: true,
    },
    {
        id: "preview-oyster",
        name: "Oyster",
        ip: "127.0.0.1",
        port: 20002,
        lastPlayed: 4,
        hidden: false,
        online: true,
    },
    {
        id: "preview-roman",
        name: "Roman",
        ip: "127.0.0.1",
        port: 20003,
        lastPlayed: 3,
        hidden: false,
        online: true,
    },
    {
        id: "preview-pearl",
        name: "Pearl",
        ip: "127.0.0.1",
        port: 20004,
        lastPlayed: 2,
        hidden: false,
        online: true,
    },
    {
        id: "preview-broccoli",
        name: "Broccoli",
        ip: "127.0.0.1",
        port: 20005,
        lastPlayed: 1,
        hidden: false,
        online: true,
    },
];

const createId = () =>
    `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;

if (!window.electron) {
    window.electron = {
        getAppVersion: async () => "2.0.3-preview",
        getAppConfig: async () => ({ ...previewConfig }),
        saveAppConfig: async () => undefined,
        getAppDataPath: async () => "C:\\MushroomLauncherPreview",

        setLanguage: async (language) => {
            previewConfig.language = language;
        },
        setClientPath: async (clientPath) => {
            previewConfig.clientPath = clientPath;
        },
        setEnableConsole: async (enableConsole) => {
            previewConfig.enableConsole = enableConsole;
        },
        setAutoLogin: async (autoLogin) => {
            previewConfig.autoLogin = autoLogin;
        },
        setAudioEnabled: async (audioEnabled) => {
            previewConfig.audioEnabled = audioEnabled;
        },
        setAudioVolume: async (audioVolume) => {
            previewConfig.audioVolume = audioVolume;
        },
        setModDeveloper: async (modDeveloper) => {
            previewConfig.modDeveloper = modDeveloper;
        },

        loadTranslation: async (language) =>
            translations[language] ?? translations.en,

        openFolder: async () => undefined,
        openClientDialog: async () => "C:\\MapleStory2",

        getDownloadProgress: async () => 0,
        getDownloadFile: async () => "",
        getDownloadEta: async () => -1,
        downloadClient: async (provider) => {
            if (provider === "github-releases") {
                window.open(
                    "https://github.com/buggywhiletrue/client/releases",
                    "_blank",
                    "noopener,noreferrer",
                );
            }
        },

        getServerList: async () => previewServers.map((server) => ({ ...server })),
        getOnlineStatus: async () => true,
        removeServer: async (id) => {
            previewServers = previewServers.filter((server) => server.id !== id);
            return true;
        },
        addServer: async (entry) => {
            previewServers.push({
                id: createId(),
                name: entry.name ?? "Preview Server",
                ip: entry.ip ?? "127.0.0.1",
                port: entry.port ?? 20001,
                lastPlayed: 0,
                hidden: entry.hidden ?? false,
                online: true,
                auth: entry.auth,
            });
            return true;
        },
        editServer: async (entry) => {
            const index = previewServers.findIndex(
                (server) => server.id === entry.id,
            );
            if (index < 0) return false;
            previewServers[index] = { ...previewServers[index], ...entry };
            return true;
        },

        preLaunchChecks: async () => [
            false,
            "Browser preview does not launch the game client.",
        ],
        launchClient: async () => [
            false,
            "Browser preview does not launch the game client.",
        ],

        getClientMods: async () => [],
        disableMod: async () => true,
        enableMod: async () => true,
        updateMod: async () => true,
        createMod: async () => [true, ""],
        updateModJson: async () => true,

        send: () => undefined,
        on: () => () => undefined,
    };
}
