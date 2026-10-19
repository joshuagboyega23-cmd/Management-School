import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export default function CbtMathView({ text = '', className = '' }) {
  if (!text && typeof text !== 'string') return null;
  const str = String(text || '');

  const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\))/g;
  const parts = str.split(regex);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part) return null;

        let math = null;
        let displayMode = false;

        if (part.startsWith('$$') && part.endsWith('$$')) {
          math = part.slice(2, -2);
          displayMode = true;
        } else if (part.startsWith('\\[') && part.endsWith('\\]')) {
          math = part.slice(2, -2);
          displayMode = true;
        } else if (part.startsWith('$') && part.endsWith('$')) {
          math = part.slice(1, -1);
          displayMode = false;
        } else if (part.startsWith('\\(') && part.endsWith('\\)')) {
          math = part.slice(2, -2);
          displayMode = false;
        }

        if (math !== null) {
          try {
            const html = katex.renderToString(math, {
              displayMode,
              throwOnError: false,
            });
            return (
              <span
                key={index}
                dangerouslySetInnerHTML={{ __html: html }}
                className={displayMode ? 'block my-2 text-center' : 'inline-block mx-0.5 align-middle'}
              />
            );
          } catch (e) {
            return (
              <span key={index} className="font-mono text-amber-600">
                {part}
              </span>
            );
          }
        }

        return (
          <span key={index} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </span>
  );
}

