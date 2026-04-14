import { useRef, useEffect } from "react";
import { S } from "../utils/styles";

export default function RichTextEditor({ value, onChange, minHeight = 90, readOnly = false }) {
  const ref = useRef(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (ref.current && !initialized.current) {
      ref.current.innerHTML = value || "";
      initialized.current = true;
    }
  }, []);

  const exec = (cmd) => {
    ref.current?.focus();
    document.execCommand(cmd, false, null);
    onChange(ref.current?.innerHTML || "");
  };

  const toolbarBtn = (label, cmd, title) => (
    <button key={cmd} type="button" title={title} onMouseDown={e => { e.preventDefault(); exec(cmd); }}
      style={{ padding: "3px 9px", borderRadius: 6, border: "1px solid #DADADA", background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: "#1D2939" }}
    >{label}</button>
  );

  return (
    <div style={{ border: "1px solid #DADADA", borderRadius: 10, overflow: "hidden", background: readOnly ? "#F9F9F9" : "#fff" }}>
      {!readOnly && (
        <div style={{ display: "flex", gap: 5, padding: "6px 8px", borderBottom: "1px solid #EAEAEA", background: "#F9FAFB" }}>
          {toolbarBtn("B", "bold", "Kalın")}
          {toolbarBtn("İ", "italic", "İtalik")}
          {toolbarBtn("• Liste", "insertUnorderedList", "Madde işaretli liste")}
          {toolbarBtn("1. Liste", "insertOrderedList", "Numaralı liste")}
        </div>
      )}
      <div ref={ref} contentEditable={!readOnly} suppressContentEditableWarning
        onInput={e => !readOnly && onChange(e.currentTarget.innerHTML)}
        style={{ padding: "9px 12px", minHeight, outline: "none", fontSize: 13, lineHeight: 1.75, fontFamily: "inherit", background: readOnly ? "#F9F9F9" : "#fff" }}
      />
    </div>
  );
}
