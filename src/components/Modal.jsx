import Icon from "./Icon";
import { S } from "../utils/styles";

export default function Modal({ title, onClose, children }) {
  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        <div style={{ ...S.flexBetween, marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
          <button onClick={onClose} style={{ ...S.btn("ghost"), padding: "4px 8px" }}><Icon name="close" size={14} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
