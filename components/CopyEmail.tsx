"use client";

import { useRef, useState } from "react";

export function CopyEmail({ email }: { email: string }) {
  const [label, setLabel] = useState("Copy email");
  const ref = useRef<HTMLElement>(null);

  function selectText() {
    if (!ref.current) return;
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    setLabel("Press ⌘C to copy");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setLabel("Copied");
      setTimeout(() => setLabel("Copy email"), 1600);
    } catch {
      selectText();
    }
  }

  return (
    <div className="mail">
      <code ref={ref}>{email}</code>
      <button className="btn ghost" type="button" onClick={copy}>{label}</button>
    </div>
  );
}
