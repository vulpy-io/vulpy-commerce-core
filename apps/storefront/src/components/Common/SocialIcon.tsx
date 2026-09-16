import type { IconType } from "react-icons";
import {
  FaFacebook,
  FaInstagram,
  FaPinterestP,
  FaTiktok,
  FaXTwitter,
} from "react-icons/fa6";

type SocialIconProps = {
  platform: string;
  className?: string;
};

const icons: Record<string, IconType> = {
  facebook: FaFacebook,
  twitter: FaXTwitter,
  instagram: FaInstagram,
  tiktok: FaTiktok,
  pinterest: FaPinterestP,
};

function normalizePlatform(platform: string): string {
  const key = platform.trim().toLowerCase();
  if (key === "x") {
    return "twitter";
  }
  return key;
}

const SocialIcon = ({ platform, className }: SocialIconProps) => {
  const Icon = icons[normalizePlatform(platform)];

  if (!Icon) {
    return (
      <span className={`text-custom-sm capitalize ${className ?? ""}`.trim()}>
        {platform}
      </span>
    );
  }

  return <Icon aria-hidden className={className} size={22} />;
};

export default SocialIcon;
