import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "../components/ui/button";
import { Container } from "./Container";
import { t } from "i18next";

import FRIENDS_ICON from "../assets/friends-icon.png";

const NOTICE_FEED_URL =
    "https://raw.githubusercontent.com/buggywhiletrue/launcher/main/notices.json";
const NOTICE_REFRESH_INTERVAL = 5 * 60 * 1000;

type NoticeType = "client" | "launcher" | "maintenance" | "general";

interface Notice {
    id: string;
    type: NoticeType;
    title: string;
    summary: string;
    publishedAt: string;
    url: string;
}

interface NoticeFeed {
    schemaVersion: number;
    notices: Notice[];
}

const noticeTypeLabel = (type: NoticeType) => {
    const labels: Record<NoticeType, string> = {
        client: t("notice.type.client", "Client update"),
        launcher: t("notice.type.launcher", "Launcher update"),
        maintenance: t("notice.type.maintenance", "Maintenance"),
        general: t("notice.type.general", "General notice"),
    };
    return labels[type];
};

const formatNoticeDate = (publishedAt: string) => {
    const date = new Date(publishedAt);
    if (Number.isNaN(date.getTime())) return publishedAt;
    return new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
};

export const NoticeWidget = () => {
    const [notice, setNotice] = useState<Notice | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;

        const fetchNotice = async () => {
            try {
                const response = await fetch(
                    `${NOTICE_FEED_URL}?t=${Date.now()}`,
                    { cache: "no-store" },
                );
                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const feed = (await response.json()) as NoticeFeed;
                if (feed.schemaVersion !== 1 || !Array.isArray(feed.notices)) {
                    throw new Error("Unsupported notice feed");
                }

                const latestNotice = [...feed.notices]
                    .filter(
                        (item) =>
                            item.id &&
                            item.title &&
                            item.summary &&
                            item.publishedAt &&
                            item.url?.startsWith("https://"),
                    )
                    .sort(
                        (a, b) =>
                            new Date(b.publishedAt).getTime() -
                            new Date(a.publishedAt).getTime(),
                    )[0];

                if (!latestNotice) throw new Error("No notices available");
                if (active) {
                    setNotice(latestNotice);
                    setError(false);
                }
            } catch {
                if (active) setError(true);
            } finally {
                if (active) setLoading(false);
            }
        };

        fetchNotice();
        const interval = window.setInterval(
            fetchNotice,
            NOTICE_REFRESH_INTERVAL,
        );
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, []);

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
            <div className="flex min-h-[8.25rem] flex-col gap-2 rounded-sm border-2 border-[#594901] bg-gradient-to-t from-[#F2F2F2] via-[#CECECE] to-[#EEEEEE] p-2 text-black text-shadow-sm/100 text-shadow-white">
                {loading && (
                    <div className="flex flex-1 items-center justify-center text-sm text-gray-600">
                        {t("notice.widget.loading", "Loading notices...")}
                    </div>
                )}

                {!loading && (error || !notice) && (
                    <div className="flex flex-1 items-center justify-center text-center text-sm text-gray-600">
                        {t(
                            "notice.widget.error",
                            "Notices are temporarily unavailable.",
                        )}
                    </div>
                )}

                {!loading && notice && (
                    <>
                        <h2 className="flex items-center gap-2 font-bold">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-[#A0A0A0] bg-black/10">
                                <Bell size={22} />
                            </span>
                            <span className="line-clamp-1">{notice.title}</span>
                        </h2>
                        <div className="flex gap-2 text-xs">
                            <div className="flex items-center gap-1">
                                <div className="h-3 w-3 rounded-full bg-green-300" />
                                {noticeTypeLabel(notice.type)}
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="flex h-3 w-3 items-center justify-center rounded-full bg-gray-400">
                                    <div className="h-1 w-1 rounded-full bg-gray-500" />
                                </div>
                                {formatNoticeDate(notice.publishedAt)}
                            </div>
                        </div>
                        <p className="line-clamp-2 min-h-8 text-xs text-gray-700">
                            {notice.summary}
                        </p>
                        <Button
                            variant="maplestory_primary"
                            size="maplestory"
                            className="mt-auto w-full"
                            onClick={() =>
                                window.open(
                                    notice.url,
                                    "_blank",
                                    "noopener,noreferrer",
                                )
                            }
                        >
                            {t("notice.widget.readMore", "Read more...")}
                        </Button>
                    </>
                )}
            </div>
        </Container>
    );
};
