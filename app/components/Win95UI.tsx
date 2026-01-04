'use client';

import { ReactNode } from 'react';

/* ---------- Styles ---------- */
export const rootStyle: any = {
  minHeight: '100vh',
  background: '#008080',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'VT323, monospace',
};

export const windowStyle = {
  width: 420,
  background: '#c0c0c0',
  borderTop: '2px solid #fff',
  borderLeft: '2px solid #fff',
  borderRight: '2px solid #404040',
  borderBottom: '2px solid #404040',
};

export const titleBarStyle = {
  background: 'linear-gradient(90deg, #000080, #1084d0)',
  color: '#fff',
  padding: '4px 8px',
  fontFamily: 'system-ui, sans-serif',
  fontWeight: 700,
  fontSize: 14,
};

const inputStyle: any = {
  width: '100%',
  padding: '4px 6px',
  background: '#fff',
  borderTop: '2px solid #808080',
  borderLeft: '2px solid #808080',
  borderRight: '2px solid #fff',
  borderBottom: '2px solid #fff',
  fontFamily: 'VT323, monospace',
  fontSize: 16,
};

/* ---------- Components ---------- */

export function Input({ label, value, onChange }: any) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

export function Textarea({ label, value, onChange }: any) {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      {label}
      <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, resize: 'none' }} />
    </label>
  );
}

export function Field({ label, value, mono }: any) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div>{label}</div>
      <div style={{ ...inputStyle, fontFamily: mono ? 'monospace' : 'inherit', overflowX: 'auto' }}>{value}</div>
    </div>
  );
}

export function Win95Button({ label, onClick, disabled, type = "button" }: any) {
  const buttonStyle = {
    width: '100%',
    marginTop: 8,
    padding: '6px 0',
    background: '#e0e0e0',
    fontFamily: 'VT323, monospace',
    fontSize: 16,
    cursor: disabled ? 'not-allowed' : 'pointer',
    borderTop: disabled ? '2px solid #808080' : '2px solid #fff',
    borderLeft: disabled ? '2px solid #808080' : '2px solid #fff',
    borderRight: disabled ? '2px solid #fff' : '2px solid #404040',
    borderBottom: disabled ? '2px solid #fff' : '2px solid #404040',
  };

  return (
    <button type={type} disabled={disabled} onClick={onClick} style={buttonStyle}>
      {label}
    </button>
  );
}

export function ErrorBox({ text }: { text: string }) {
  return <div style={{ ...inputStyle, color: '#800000', marginBottom: 8, border: '2px solid #800000' }}>{text}</div>;
}

export const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});