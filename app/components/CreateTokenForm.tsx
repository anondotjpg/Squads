'use client';

import { useState, useRef, ChangeEvent } from 'react';
import { Win95Button } from './Win95UI';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

interface FormData {
  name: string;
  symbol: string;
  description: string;
  imageFile: File | null;
  twitterUrl: string;
  websiteUrl: string;
  telegramUrl: string;
  initialBuyAmountSol: string; // always "0"
}

interface CreateTokenFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  isLoading: boolean;
}

export default function CreateTokenForm({ onSubmit, isLoading }: CreateTokenFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    symbol: '',
    description: '',
    imageFile: null,
    twitterUrl: '',
    websiteUrl: '',
    telegramUrl: '',
    initialBuyAmountSol: '0', // 🔒 hard-locked
  });

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    // 🔒 Dev buy can NEVER change
    if (name === 'initialBuyAmountSol') return;

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setImageError(null);
    const file = e.target.files?.[0];

    if (!file) {
      setFormData((prev) => ({ ...prev, imageFile: null }));
      setImagePreview(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setImageError('Image must be under 15MB');
      e.target.value = '';
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setImageError('Please upload PNG, JPG, GIF, or WebP');
      e.target.value = '';
      return;
    }

    setFormData((prev) => ({ ...prev, imageFile: file }));

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({ ...prev, imageFile: null }));
    setImagePreview(null);
    setImageError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 🔐 Absolute guarantee on submit
    await onSubmit({
      ...formData,
      initialBuyAmountSol: '0',
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 6px',
    border: '2px inset #808080',
    backgroundColor: '#fff',
    fontFamily: 'inherit',
    fontSize: '14px',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '4px',
    fontWeight: 'bold',
  };

  const fieldGroupStyle: React.CSSProperties = {
    marginBottom: '12px',
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Image Upload */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Token Image *</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {imagePreview ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <img
              src={imagePreview}
              alt="Token preview"
              style={{
                width: '80px',
                height: '80px',
                objectFit: 'cover',
                border: '2px inset #808080',
              }}
            />
            <div>
              <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                {formData.imageFile?.name}
              </div>
              <Win95Button
                label="Remove"
                onClick={handleRemoveImage}
                type="button"
              />
            </div>
          </div>
        ) : (
          <Win95Button
            label="Choose Image..."
            onClick={() => fileInputRef.current?.click()}
            type="button"
          />
        )}

        {imageError && (
          <div style={{ color: '#c00', fontSize: '12px', marginTop: '4px' }}>
            {imageError}
          </div>
        )}
        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
          PNG, JPG, GIF, or WebP. Max 15MB.
        </div>
      </div>

      {/* Name */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Name *</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleInputChange}
          placeholder="My Squad"
          style={inputStyle}
          required
        />
      </div>

      {/* Symbol */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Symbol *</label>
        <input
          type="text"
          name="symbol"
          value={formData.symbol}
          onChange={handleInputChange}
          placeholder="SQUAD"
          maxLength={10}
          style={inputStyle}
          required
        />
      </div>

      {/* Description */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Description *</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          placeholder="Describe your squad..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          required
        />
      </div>

      {/* Social Links */}
      <details style={{ marginBottom: '12px' }}>
        <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
          Social Links (optional)
        </summary>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Twitter URL</label>
          <input
            type="url"
            name="twitterUrl"
            value={formData.twitterUrl}
            onChange={handleInputChange}
            placeholder="https://twitter.com/..."
            style={inputStyle}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Website URL</label>
          <input
            type="url"
            name="websiteUrl"
            value={formData.websiteUrl}
            onChange={handleInputChange}
            placeholder="https://..."
            style={inputStyle}
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Telegram URL</label>
          <input
            type="url"
            name="telegramUrl"
            value={formData.telegramUrl}
            onChange={handleInputChange}
            placeholder="https://t.me/..."
            style={inputStyle}
          />
        </div>
      </details>

      {/* Submit */}
      <Win95Button
        label={isLoading ? 'Launching...' : 'Launch Token'}
        type="submit"
        disabled={isLoading || !formData.imageFile}
      />
    </form>
  );
}
