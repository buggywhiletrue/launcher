import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "../components/ui/button";
import { Container } from "./Container";
import { useAppState } from "./AppState";
import { t } from "i18next";

import FRIENDS_ICON from "../assets/friends-icon.png";

const RELEASE_REFRESH_INTERVAL = 30 * 60 * 1000;
const RELEASE_ENDPOINTS = {
    launcher:
        "https://api.github.com/repos/buggywhiletrue/launcher/releases/latest",
    client: "https://api.github.com/repos/buggywhiletrue/client/releases/latest",
} as const;

type ReleaseKind = keyof typeof RELEASE_ENDPOINTS;

interface GitHubRelease {
    tag_name: string;
    name: string | null;
    html_url: string;
    published_at: string;
}

interface ReleaseSummary extends GitHubRelease {
    kind: ReleaseKind;
}

const releaseCacheKey = (kind: ReleaseKind) =>
    `buggywhiletrue.latest-release.${kind}`;

const isRelease = (value: unknown): value is GitHubRelease => {
    if (!value || typeof value !== "object") return false;
    const release = value as Partial<GitHubRelease>;
    return (
        typeof release.tag_name === "string" &&
        (typeof release.name === "string" || release.name === null) &&
        typeof release.html_url === "string" &&
        release.html_url.startsWith("https://github.com/") &&
        typeof release.published_at === "string" &&
        !Number.isNaN(new Date(release.published_at).getTime())
    );
};

const readCachedRelease = (kind: ReleaseKind): ReleaseSummary | null => {
    try {
        const cached = JSON.parse(
            window.localStorage.getItem(releaseCacheKey(kind)) ?? "null",
        ) as unknown;
        return isRelease(cached) ? { ...cached, kind } : null;
    } catch {
        return null;
    }
};

const fetchLatestRelease = async (
    kind: ReleaseKind,
): Promise<ReleaseSummary> => {
    try {
        const response = await fetch(RELEASE_ENDPOINTS[kind], {
            cache: "no-store",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const release = (await response.json()) as unknown;
        if (!isRelease(release)) throw new Error("Invalid release response");

        window.localStorage.setItem(
            releaseCacheKey(kind),
            JSON.stringify(release),
        );
        return { ...release, kind };
    } catch (error) {
        const cached = readCachedRelease(kind);
        if (cached) return cached;
        throw error;
    }
};

const formatReleaseDate = (publishedAt: string) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(publishedAt));
    const getPart = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? "";
    return [getPart("year"), getPart("month"), getPart("day")].join(".");
};

const formatVersion = (tagName: string) => {
    const version = tagName.match(
        /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/,
    )?.[0];
    return version ? `v${version}` : tagName;
};

const normalizedVersion = (value: string | null | undefined) =>
    value?.match(/\d+(?:\.\d+){2,3}/)?.[0] ?? null;

const versionsMatch = (
    installedVersion: string | null | undefined,
    releaseTag: string,
) => {
    const installed = normalizedVersion(installedVersion);
    const latest = normalizedVersion(releaseTag);
    return installed !== null && latest !== null && installed === latest;
};

const VersionStatus = ({ current }: { current: boolean }) =>
    current ? (
        <div
            className="h-3 w-3 rounded-full bg-green-300"
            title="Up to date"
        />
    ) : (
        <div
            className="flex h-3 w-3 items-center justify-center rounded-full bg-gray-400"
            title="Update required or version unknown"
        >
            <div className="h-1 w-1 rounded-full bg-gray-500" />
        </div>
    );

export const NoticeWidget = () => {
    const { appVersion } = useAppState();
    const [releases, setReleases] = useState<ReleaseSummary[] | null>(null);
    const [installedClientVersion, setInstalledClientVersion] = useState<
        string | null
    >(null);

    useEffect(() => {
        let active = true;

        const fetchReleases = async () => {
            const [results, clientVersion] = await Promise.all([
                Promise.allSettled([
                    fetchLatestRelease("launcher"),
                    fetchLatestRelease("client"),
                ]),
                window.electron
                    .getInstalledClientVersion()
                    .catch(() => null),
            ]);
            if (!active) return;
            setInstalledClientVersion(clientVersion);

            const available: ReleaseSummary[] = [];
            results.forEach((result) => {
                if (result.status === "fulfilled") {
                    available.push(result.value);
                }
            });
            available.sort(
                (a, b) =>
                    new Date(b.published_at).getTime() -
                    new Date(a.published_at).getTime(),
            );
            setReleases(available);
        };

        fetchReleases();
        const interval = window.setInterval(
            fetchReleases,
            RELEASE_REFRESH_INTERVAL,
        );
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, []);

    const latestRelease = releases?.[0];
    const launcherRelease = releases?.find(
        (release) => release.kind === "launcher",
    );
    const clientRelease = releases?.find(
        (release) => release.kind === "client",
    );
    const clientIsCurrent = Boolean(
        clientRelease &&
            versionsMatch(installedClientVersion, clientRelease.tag_name),
    );
    const launcherIsCurrent = Boolean(
        launcherRelease && versionsMatch(appVersion, launcherRelease.tag_name),
    );
    const clientNeedsUpdate = Boolean(clientRelease && !clientIsCurrent);
    const launcherNeedsUpdate = Boolean(launcherRelease && !launcherIsCurrent);
    const statusMessage =
        clientNeedsUpdate && launcherNeedsUpdate
            ? t(
                  "notice.widget.status.bothMismatch",
                  "The client and launcher versions do not match. Please update them.",
              )
            : clientNeedsUpdate
              ? t(
                    "notice.widget.status.clientMismatch",
                    "The client version does not match. Please update it.",
                )
              : launcherNeedsUpdate
                ? t(
                      "notice.widget.status.launcherMismatch",
                      "The launcher version does not match. Please update it.",
                  )
                : t(
                      "notice.widget.status.current",
                      "You are using the latest version.",
                  );

    return (
        <Container
            title={
                <div className="relative">
                    <img
                        src={FRIENDS_ICON}
                        alt=""
                        className="absolute -top-5 left-0 w-12"
                    />
                    <div className="pl-15">
                        {t("notice.widget.title", "Notices")}
                    </div>
                </div>
            }
        >
            <div className="flex min-h-[8.25rem] flex-col gap-2 rounded-sm border-2 border-[#594901] bg-gradient-to-t from-[#F2F2F2] to-[#CECECE] p-2 text-center text-black text-shadow-sm/100 text-shadow-white">
                {releases === null && (
                    <div className="flex flex-1 items-center justify-center text-sm text-gray-600">
                        {t(
                            "notice.widget.loading",
                            "Loading release information...",
                        )}
                    </div>
                )}

                {releases?.length === 0 && (
                    <div className="flex flex-1 items-center justify-center text-center text-sm text-gray-600">
                        {t(
                            "notice.widget.error",
                            "Release information is temporarily unavailable.",
                        )}
                    </div>
                )}

                {latestRelease && (
                    <>
                        <h2 className="flex items-center justify-center gap-2 font-bold">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[#A0A0A0] bg-black/10">
                                <Bell size={22} />
                            </span>
                            <span className="line-clamp-1">
                                {t(
                                    "notice.widget.latestUpdate",
                                    "Latest update",
                                )}{" "}
                                {formatReleaseDate(latestRelease.published_at)}
                            </span>
                        </h2>
                        <div className="grid grid-cols-2 items-center gap-x-3 px-2 text-[0.8rem] font-semibold">
                            {clientRelease && (
                                <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                                    <VersionStatus current={clientIsCurrent} />
                                    {t("notice.widget.client", "Client")}{" "}
                                    {formatVersion(clientRelease.tag_name)}
                                </div>
                            )}
                            {launcherRelease && (
                                <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                                    <VersionStatus current={launcherIsCurrent} />
                                    {t("notice.widget.launcher", "Launcher")}{" "}
                                    {formatVersion(launcherRelease.tag_name)}
                                </div>
                            )}
                        </div>
                        <p className="flex min-h-8 items-center justify-center text-sm font-semibold text-gray-700">
                            {statusMessage}
                        </p>
                        <Button
                            variant="maplestory_primary"
                            size="maplestory"
                            className="mt-auto w-full"
                            onClick={() =>
                                window.open(
                                    "https://app.notion.com/p/MapleStory2-38eafc48a0d280619472feafb97daf6b?source=copy_link",
                                    "_blank",
                                    "noopener,noreferrer",
                                )
                            }
                        >
                            {t("notice.widget.help", "View help")}
                        </Button>
                    </>
                )}
            </div>
        </Container>
    );
};
