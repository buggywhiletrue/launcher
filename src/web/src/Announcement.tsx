import { useState } from "react";
import { Container } from "./Container";

export const Announcement = ({ title = "공지사항", message = "여기에 공지 내용을 입력하세요." }: { title?: string; message?: string }) => {
    const [visible] = useState(true);

    if (!visible) return null;

    return (
        <Container
            title={
                <div className="relative">
                    <div className="pl-0">{title}</div>
                </div>
            }
        >
            <div className="rounded-sm border-2 border-[#594901] bg-gradient-to-t from-[#F2F2F2] via-[#CECECE] to-[#EEEEEE] p-2 text-black text-shadow-sm/100 text-shadow-white">
                <div className="text-sm whitespace-pre-wrap">{message}</div>
            </div>
        </Container>
    );
};

export default Announcement;
