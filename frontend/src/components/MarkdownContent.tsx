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

function renderInline(text: string): React.ReactNode[] {
  const normalized = normalizeHtmlTagsToMarkdown(text);
  const tokenRegex =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<)\]]+|\n)/g;
  const parts = normalized.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code key={idx} className="inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={idx}>{renderInline(part.slice(2, -2))}</strong>;
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return <em key={idx}>{renderInline(part.slice(1, -1))}</em>;
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="chat-link"
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
            className="chat-link"
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
        <ul className="table-cell-list">
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
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
    <div key={`table-${keyPrefix}`} className="table-wrap">
      <table className="chat-table">
        <thead>
          <tr>
            {headerCells.map((th, idx) => (
              <th key={idx}>{renderInline(th)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {headerCells.map((_, colIdx) => (
                <td key={colIdx}>
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
        <div key={`code-${blockKey++}`} className="code-block-wrap">
          {lang && <div className="code-block-header">{lang}</div>}
          <pre className="code-block">
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
      elements.push(<hr key={`hr-${blockKey++}`} className="chat-divider" />);
      idx++;
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      elements.push(
        <h4 key={`h4-${blockKey++}`} className="chat-h4">
          {renderInline(trimmed.slice(5))}
        </h4>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${blockKey++}`} className="chat-h3">
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${blockKey++}`} className="chat-h2">
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      idx++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1 key={`h1-${blockKey++}`} className="chat-h1">
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
        <blockquote key={`quote-${blockKey++}`} className="chat-quote">
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
          !isBulletItem &&
          !isNumberedItem &&
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
          <ol key={`ol-${blockKey++}`} className="chat-ol">
            {listItems.map((item, i) => (
              <li key={i}>{renderInline(item)}</li>
            ))}
          </ol>
        );
      } else {
        elements.push(
          <ul key={`ul-${blockKey++}`} className="chat-ul">
            {listItems.map((item, i) => (
              <li key={i}>{renderInline(item)}</li>
            ))}
          </ul >
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
        <p key={`p-${blockKey++}`} className="chat-paragraph">
          {renderInline(paragraphLines.join(" "))}
        </p>
      );
    }
  }

  return <div className="markdown-body">{elements}</div>;
}
