import React from "react";

interface MarkdownContentProps {
  content: string;
}

function normalizeHtmlTagsToMarkdown(raw: string): string {
  return raw
    .replace(/<(https?:\/\/[^\s>]+)>/gi, "[$1]($1)")
    .replace(/<\/?(?:ul|ol)\b[^>]*>/gi, "")
    .replace(/<li\b[^>]*>/gi, " • ")
    .replace(/<\/li\b[^>]*>/gi, "")
    .replace(/<(?:i|em)\b[^>]*>([\s\S]*?)<\/(?:i|em)\b[^>]*>/gi, "*$1*")
    .replace(/<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)\b[^>]*>/gi, "**$1**")
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code\b[^>]*>/gi, "`$1`")
    .replace(/<\/?(?:i|em|b|strong)\b[^>]*>/gi, "")
    .replace(/<br\b[^>]*\/?>/gi, " • ")
    .replace(/<\/?p\b[^>]*>/gi, "\n\n");
}

function renderInline(text: string, needsNormalize = true): React.ReactNode[] {
  const normalized = needsNormalize ? normalizeHtmlTagsToMarkdown(text) : text;
  const tokenRegex =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<)\]]+|\n)/g;
  const parts = normalized.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={idx}
          className="rounded-[4px] border border-border-subtle bg-white/8 px-[5px] py-[1px] font-mono text-[0.82em] text-[#f1f5f9]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={idx}>{renderInline(part.slice(2, -2), false)}</strong>;
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return <em key={idx}>{renderInline(part.slice(1, -1), false)}</em>;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#60a5fa] underline underline-offset-2 hover:text-[#93c5fd]"
        >
          {linkMatch[1]}
        </a>
      );
    }

    if (part.startsWith("http://") || part.startsWith("https://")) {
      const trailingMatch = part.match(/^(https?:\/\/.+?)([.,;:!?]+)$/);
      const cleanUrl = trailingMatch ? trailingMatch[1] : part;
      const trailing = trailingMatch ? trailingMatch[2] : "";
      return (
        <React.Fragment key={idx}>
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#60a5fa] underline underline-offset-2 hover:text-[#93c5fd]"
          >
            {cleanUrl}
          </a>
          {trailing}
        </React.Fragment>
      );
    }

    if (part === "\n") {
      return <br key={idx} />;
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderTableCellContent(rawCell: string): React.ReactNode {
  const trimmed = normalizeHtmlTagsToMarkdown(rawCell).trim();
  if (
    trimmed.includes("•") ||
    trimmed.startsWith("- ")
  ) {
    const items = trimmed
      .split(/\s*•\s*|(?:^|\n)-\s*/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (items.length > 1) {
      return (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-3.5">
          {items.map((it, i) => (
            <li key={i} className="leading-[1.45]">
              {renderInline(it)}
            </li>
          ))}
        </ul>
      );
    }
  }

  return renderInline(trimmed);
}

function parseMarkdownTable(lines: string[], keyPrefix: number): React.ReactNode | null {
  if (lines.length < 2) return null;

  const splitRow = (line: string) => {
    const cleaned = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return cleaned.split("|").map((c) => c.trim());
  };

  const headerCells = splitRow(lines[0]);
  const separatorLine = lines[1];

  if (!/^[\s|:-]+$/.test(separatorLine) || !separatorLine.includes("-")) {
    return null;
  }

  const dataRows = lines.slice(2).map(splitRow);

  return (
    <div
      key={`table-${keyPrefix}`}
      className="no-scrollbar my-2 overflow-x-auto rounded-[10px] border border-border-subtle bg-[#0c1220]"
    >
      <table className="w-full border-collapse text-left text-[0.82rem] leading-[1.5] sm:text-[0.88rem] sm:leading-[1.55]">
        <thead className="border-b border-border-subtle bg-[#121c33]">
          <tr>
            {headerCells.map((th, idx) => (
              <th
                key={idx}
                className="px-2.5 py-2 text-[0.78rem] font-semibold tracking-[0.01em] text-[#f8fafc] first:whitespace-nowrap sm:px-3.5 sm:py-2.5 sm:text-[0.82rem]"
              >
                {renderInline(th)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rowIdx) => (
            <tr key={rowIdx} className="group transition-colors hover:bg-[#1b2e59]/25">
              {headerCells.map((_, colIdx) => (
                <td
                  key={colIdx}
                  className="border-b border-[#1b2e59]/70 px-2.5 py-2 align-top text-text-primary first:whitespace-nowrap group-last:border-b-0 sm:px-3.5 sm:py-[11px]"
                >
                  {renderTableCellContent(row[colIdx] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  if (!content) return null;

  const normalizedContent = normalizeHtmlTagsToMarkdown(content);
  const rawLines = normalizedContent.split(/\r?\n/);
  const elements: React.ReactNode[] = [];

  let idx = 0;
  let blockKey = 0;

  while (idx < rawLines.length) {
    const line = rawLines[idx];
    const trimmed = line.trim();

    if (!trimmed) {
      idx++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      idx++;
      while (idx < rawLines.length && !rawLines[idx].trim().startsWith("```")) {
        codeLines.push(rawLines[idx]);
        idx++;
      }
      if (idx < rawLines.length) idx++;
      elements.push(
        <div
          key={`code-${blockKey++}`}
          className="my-1 overflow-hidden rounded-[6px] border border-border-subtle bg-[#0a0e17]"
        >
          {lang && (
            <div className="border-b border-border-subtle px-2.5 py-1 font-mono text-[0.72rem] text-text-muted lowercase">
              {lang}
            </div>
          )}
          <pre className="no-scrollbar m-0 overflow-x-auto px-3 py-2.5 font-mono text-[0.84rem] leading-[1.5] text-text-primary">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>
      );
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|")) {
      const tableLines: string[] = [];
      let nextIdx = idx;
      while (
        nextIdx < rawLines.length &&
        rawLines[nextIdx].trim().startsWith("|") &&
        rawLines[nextIdx].trim().includes("|")
      ) {
        tableLines.push(rawLines[nextIdx]);
        nextIdx++;
      }
      const tableNode = parseMarkdownTable(tableLines, blockKey++);
      if (tableNode) {
        elements.push(tableNode);
        idx = nextIdx;
        continue;
      }
    }

    if (/^(?:[-*_]\s*){3,}$/.test(trimmed)) {
      elements.push(
        <hr
          key={`hr-${blockKey++}`}
          className="my-2.5 w-full border-none border-t border-border-subtle"
        />
      );
      idx++;
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      elements.push(
        <h4
          key={`h4-${blockKey++}`}
          className="mt-2 mb-0.5 text-[0.88rem] font-semibold tracking-[-0.01em] text-text-primary"
        >
          {renderInline(trimmed.slice(5))}
        </h4>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3
          key={`h3-${blockKey++}`}
          className="mt-2 mb-0.5 text-[0.96rem] font-semibold tracking-[-0.01em] text-text-primary"
        >
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2
          key={`h2-${blockKey++}`}
          className="mt-2 mb-0.5 text-[1.05rem] font-semibold tracking-[-0.01em] text-text-primary"
        >
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1
          key={`h1-${blockKey++}`}
          className="mt-2 mb-0.5 text-[1.15rem] font-semibold tracking-[-0.01em] text-text-primary"
        >
          {renderInline(trimmed.slice(2))}
        </h1>
      );
      idx++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (idx < rawLines.length && rawLines[idx].trim().startsWith(">")) {
        quoteLines.push(rawLines[idx].trim().replace(/^>\s?/, ""));
        idx++;
      }
      elements.push(
        <blockquote
          key={`quote-${blockKey++}`}
          className="m-0 rounded-r-[6px] border-l-[3px] border-border-focus bg-bg-surface-hover px-3 py-2 text-text-secondary italic"
        >
          {renderInline(quoteLines.join(" "))}
        </blockquote>
      );
      continue;
    }

    const isBulletItem = /^[-*•]\s+/.test(trimmed);
    const isNumberedItem = /^\d+\.\s+/.test(trimmed);

    if (isBulletItem || isNumberedItem) {
      const listItems: string[] = [];
      const isOrdered = isNumberedItem;

      while (idx < rawLines.length) {
        const curTrimmed = rawLines[idx].trim();
        const bulletMatch = curTrimmed.match(/^[-*•]\s+(.*)$/);
        const numberMatch = curTrimmed.match(/^\d+\.\s+(.*)$/);

        if (isOrdered && numberMatch) {
          listItems.push(numberMatch[1]);
          idx++;
        } else if (!isOrdered && bulletMatch) {
          listItems.push(bulletMatch[1]);
          idx++;
        } else if (
          curTrimmed &&
          !bulletMatch &&
          !numberMatch &&
          listItems.length > 0 &&
          (rawLines[idx].startsWith("  ") || rawLines[idx].startsWith("\t"))
        ) {
          listItems[listItems.length - 1] += ` ${curTrimmed}`;
          idx++;
        } else {
          break;
        }
      }

      if (isOrdered) {
        elements.push(
          <ol
            key={`ol-${blockKey++}`}
            className="m-0 flex list-decimal flex-col gap-1.5 pl-5 [&_li]:leading-[1.55]"
          >
            {listItems.map((item, i) => (
              <li key={i}>{renderInline(item)}</li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul
            key={`ul-${blockKey++}`}
            className="m-0 flex list-disc flex-col gap-1.5 pl-5 [&_li]:leading-[1.55]"
          >
            {listItems.map((item, i) => (
              <li key={i}>{renderInline(item)}</li>
            ))}
          </ul>
        );
      }
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      idx < rawLines.length &&
      rawLines[idx].trim() &&
      !rawLines[idx].trim().startsWith("```") &&
      !rawLines[idx].trim().startsWith("#") &&
      !rawLines[idx].trim().startsWith(">") &&
      !(rawLines[idx].trim().startsWith("|") && rawLines[idx].trim().endsWith("|")) &&
      !/^(?:[-*_]\s*){3,}$/.test(rawLines[idx].trim()) &&
      !/^[-*•]\s+/.test(rawLines[idx].trim()) &&
      !/^\d+\.\s+/.test(rawLines[idx].trim())
    ) {
      paragraphLines.push(rawLines[idx].trim());
      idx++;
    }

    if (paragraphLines.length > 0) {
      elements.push(
        <p key={`p-${blockKey++}`} className="m-0 leading-[1.62]">
          {renderInline(paragraphLines.join(" "))}
        </p>
      );
    }
  }

  return (
    <div className="flex flex-col gap-3 leading-[1.65] text-text-primary [&_strong]:font-semibold [&_strong]:text-white">
      {elements}
    </div>
  );
}
