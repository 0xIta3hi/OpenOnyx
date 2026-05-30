/**
 * URL utility helpers for smart iframe embeds and URL formatting.
 */

export interface SmartEmbedConfig {
  src: string;
  attrs: {
    allow?: string;
    allowFullScreen?: boolean;
    style?: React.CSSProperties;
  };
  badge: string;
}

/**
 * Returns the smart iframe URL, attributes, and category badge for a given URL.
 */
export function getSmartEmbed(url: string): SmartEmbedConfig {
  const cleanUrl = url.replace(/#no-embed/g, "").trim();

  // 1. YouTube
  const ytMatch = cleanUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?]+)/);
  if (ytMatch) {
    return {
      src: `https://www.youtube.com/embed/${ytMatch[1]}?vq=hd1080&rel=0`,
      attrs: {
        allow: "fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture",
        allowFullScreen: true,
      },
      badge: "YouTube",
    };
  }

  // 2. Spotify
  if (cleanUrl.includes("open.spotify.com/")) {
    const embedUrl = cleanUrl.includes("/embed/")
      ? cleanUrl
      : cleanUrl.replace("open.spotify.com/", "open.spotify.com/embed/");
    return {
      src: embedUrl,
      attrs: {
        allow: "encrypted-media",
        style: { borderRadius: "12px" },
      },
      badge: "Spotify",
    };
  }

  // 3. Vimeo
  const vimeoMatch = cleanUrl.match(/(?:vimeo\.com\/video\/|vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
  if (vimeoMatch) {
    return {
      src: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      attrs: {
        allow: "fullscreen; autoplay; picture-in-picture",
        allowFullScreen: true,
      },
      badge: "Vimeo",
    };
  }

  // 4. Other types
  let badge = "Web Page";
  if (cleanUrl.endsWith(".pdf") || cleanUrl.includes(".pdf?")) {
    badge = "PDF";
  } else if (cleanUrl.match(/\.(mp4|webm|ogg)(?:\?.*)?$/i)) {
    badge = "Video Player";
  } else if (cleanUrl.match(/\.(mp3|wav|ogg|m4a)(?:\?.*)?$/i)) {
    badge = "Audio Player";
  }

  return {
    src: cleanUrl,
    attrs: {
      allow: "fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture",
      allowFullScreen: true,
    },
    badge,
  };
}

/**
 * Returns the hostname of the URL, stripped of the leading 'www.'.
 */
export function getDisplayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Toggles #no-embed in a markdown string for a given URL.
 */
export function toggleUrlInMarkdown(content: string, url: string, targetToLink: boolean): string {
  const cleanUrl = url.replace(/#no-embed/g, "").trim();
  const escapedUrl = cleanUrl.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

  if (targetToLink) {
    const regex = new RegExp(`(${escapedUrl})(?!\\s*#no-embed)`, "g");
    return content.replace(regex, `$1#no-embed`);
  } else {
    const regex = new RegExp(`${escapedUrl}\\s*#no-embed`, "g");
    return content.replace(regex, cleanUrl);
  }
}
