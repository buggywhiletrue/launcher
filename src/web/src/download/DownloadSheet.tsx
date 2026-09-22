import { Download, DownloadIcon, Folder, GithubIcon, Link } from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "../../components/ui/sheet";

import { t } from "i18next";
import { Separator } from "../../components/ui/separator";
import { Button } from "../../components/ui/button";
import { ClientPath } from "../client/ClientPath";
import { useAppState } from "../AppState";
import { useState } from "react";

export const DownloadSheet = () => {
    const { downloadInProgress, setDownloadInProgress, setClientPath } =
        useAppState();

    const [pathError, setPathError] = useState("");

    const startDownload = (provider: string) => {
        if (downloadInProgress) {
            return;
        }

        window.electron.downloadClient(provider);

        setDownloadInProgress(true);
    };

    return (
        <>
            <Sheet
                onOpenChange={(o) => {
                    if (!o) {
                        window.electron.saveAppConfig();
                        setPathError("");
                    }
                }}
            >
                <SheetTrigger
                    className="cursor-pointer rounded-md p-2 hover:bg-gray-200/15"
                    title={t("header.download", "Client download")}
                >
                    <DownloadIcon />
                </SheetTrigger>
                <SheetContent>
                    <SheetHeader>
                        <SheetTitle>
                            {t("download.title", "Client Install")}
                        </SheetTitle>
                        <SheetDescription className="flex w-10/12 flex-col gap-2">
                            <Separator />
                            <div className="flex flex-col gap-2">
                                <ClientPath />
                                <Button
                                    variant="outline"
                                    disabled={downloadInProgress}
                                    onClick={async () => {
                                        const newPath =
                                            await window.electron.openClientDialog();

                                        if (!newPath) {
                                            setPathError(
                                                t(
                                                    "download.install.path.missing",
                                                    "Invalid path selected.",
                                                ),
                                            );
                                            return;
                                        }

                                        // Match protected windows folders
                                        const protectedDrive = "C:\\";
                                        const protectedFolders = [
                                            "Program Files",
                                            "Program Files (x86)",
                                            "Windows",
                                            "ProgramData",
                                        ];
                                        const isProtected =
                                            protectedFolders.some(
                                                (folder) =>
                                                    newPath.startsWith(
                                                        protectedDrive,
                                                    ) &&
                                                    newPath.includes(folder),
                                            );
                                        if (isProtected) {
                                            setPathError(
                                                t(
                                                    "download.install.path.protected",
                                                    "Cannot select a protected folder.",
                                                ),
                                            );
                                            return;
                                        }

                                        setPathError("");
                                        setClientPath(newPath);
                                    }}
                                >
                                    {t(
                                        "download.install.directory",
                                        "Select Client Install Location",
                                    )}{" "}
                                    <Folder />
                                </Button>
                                <div className="text-xs text-red-400">
                                    {pathError}
                                </div>
                                <small>
                                    {t(
                                        "download.install.info",
                                        "Install directory for your MapleStory 2 client.",
                                    )}
                                </small>
                                <div
                                    className="cursor-pointer text-xs text-blue-500 underline"
                                    onClick={async () => {
                                        const appDataPath =
                                            await window.electron.getAppDataPath();
                                        setPathError("");
                                        setClientPath(
                                            `${appDataPath}\\appdata`,
                                        );
                                    }}
                                >
                                    {t(
                                        "download.install.path.recommended",
                                        "Use recommended directory",
                                    )}
                                </div>
                            </div>
                            <Separator />
                            <div className="flex flex-col gap-2">
                                <Button
                                    variant="outline"
                                    disabled={downloadInProgress}
                                    onClick={() => startDownload("automatic")}
                                >
                                    {t(
                                        "download.install.automatic",
                                        "Automatic download",
                                    )}{" "}
                                    <Download />
                                </Button>
                                <small>
                                    {t(
                                        "download.install.automatic.info",
                                        "Downloads and installs the latest client automatically. (Recommended)",
                                    )}
                                </small>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Button
                                    variant="outline"
                                    disabled={downloadInProgress}
                                    onClick={() =>
                                        startDownload("github-releases")
                                    }
                                >
                                    {t(
                                        "download.install.githubReleases",
                                        "View on GitHub Releases",
                                    )}{" "}
                                    <GithubIcon />
                                </Button>
                                <small>
                                    {t(
                                        "download.install.githubReleases.info",
                                        "Opens the client release page in your browser.",
                                    )}
                                </small>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Button
                                    variant="outline"
                                    disabled={downloadInProgress}
                                    onClick={() => startDownload("drive")}
                                >
                                    {t(
                                        "download.install.drive",
                                        "View on Drive",
                                    )}{" "}
                                    <Link />
                                </Button>
                                <small>
                                    {t(
                                        "download.install.drive.info",
                                        "Opens the alternative download page in your browser.",
                                    )}
                                </small>
                            </div>
                        </SheetDescription>
                    </SheetHeader>
                </SheetContent>
            </Sheet>
        </>
    );
};
