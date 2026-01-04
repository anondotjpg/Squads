'use client';

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { Win95Button } from './Win95UI';

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const RATE_LIMIT_KEY = 'lastTokenLaunch';
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000; // 24 hours

interface FormData {
  name: string;
  symbol: string;
  description: string;
  imageFile: File | null;
  twitterUrl: string;
  websiteUrl: string;
  telegramUrl: string;
  initialBuyAmountSol: string;
}

interface CreateTokenFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  isLoading: boolean;
}

function getTimeUntilNextLaunch(): number | null {
  if (typeof window === 'undefined') return null;
  const lastLaunch = localStorage.getItem(RATE_LIMIT_KEY);
  if (!lastLaunch) return null;
  
  const elapsed = Date.now() - parseInt(lastLaunch, 10);
  const remaining = RATE_LIMIT_MS - elapsed;
  return remaining > 0 ? remaining : null;
}

function formatTimeRemaining(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export default function CreateTokenForm({ onSubmit, isLoading }: CreateTokenFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(null);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    symbol: '',
    description: '',
    imageFile: null,
    twitterUrl: '',
    websiteUrl: '',
    telegramUrl: '',
    initialBuyAmountSol: '0',
  });

  // Check rate limit on mount and update countdown
  useEffect(() => {
    const checkCooldown = () => {
      const remaining = getTimeUntilNextLaunch();
      setCooldownRemaining(remaining);
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
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

    // Check rate limit before submitting
    const remaining = getTimeUntilNextLaunch();
    if (remaining) {
      setCooldownRemaining(remaining);
      return;
    }

    try {
      await onSubmit({
        ...formData,
        initialBuyAmountSol: '0',
      });

      // Record successful launch timestamp
      localStorage.setItem(RATE_LIMIT_KEY, Date.now().toString());
      setCooldownRemaining(RATE_LIMIT_MS);
    } catch (error) {
      // Don't set rate limit if launch failed
      console.error('Launch failed:', error);
    }
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

  const isRateLimited = cooldownRemaining !== null && cooldownRemaining > 0;

  return (
    <form onSubmit={handleSubmit}>
      {/* Rate Limit Warning */}
      {isRateLimited && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: '12px',
            backgroundColor: '#ffffcc',
            border: '2px solid #808080',
            borderStyle: 'inset',
          }}
        >
          ⏰ You can launch another token in{' '}
          <strong>{formatTimeRemaining(cooldownRemaining)}</strong>
        </div>
      )}

      {/* Image Upload */}
      <div style={fieldGroupStyle}>
        <label style={labelStyle}>Token Image *</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          disabled={isRateLimited}
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
                disabled={isRateLimited}
              />
            </div>
          </div>
        ) : (
          <Win95Button
            label="Choose Image..."
            onClick={() => fileInputRef.current?.click()}
            type="button"
            disabled={isRateLimited}
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
          disabled={isRateLimited}
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
          disabled={isRateLimited}
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
          disabled={isRateLimited}
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
            disabled={isRateLimited}
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
            disabled={isRateLimited}
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
            disabled={isRateLimited}
          />
        </div>
      </details>

      {/* Submit */}
      <Win95Button
        label={
          isRateLimited
            ? `Wait ${formatTimeRemaining(cooldownRemaining)}`
            : isLoading
            ? 'Launching...'
            : 'Launch Token'
        }
        type="submit"
        disabled={isLoading || !formData.imageFile || isRateLimited}
      />
    </form>
  );
}