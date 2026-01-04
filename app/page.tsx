'use client';

import { useState } from 'react';
import { Field, Win95Button, ErrorBox, windowStyle, titleBarStyle } from './components/Win95UI';
import CreateTokenForm from './components/CreateTokenForm';
import TokenGrid from './components/TokenGrid';

interface LaunchResult {
  tokenMint: string;
  signature: string;
  metadataUri: string;
  bagsUrl: string;
}

interface FormData {
  name: string;
  symbol: string;
  description: string;
  imageFile: File | null;
  twitterUrl?: string;
  websiteUrl?: string;
  telegramUrl?: string;
  initialBuyAmountSol: string;
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async (formData: FormData) => {
    if (!formData.imageFile) {
      setError('Image is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const submitData = new window.FormData();
      submitData.append('image', formData.imageFile);
      submitData.append('name', formData.name);
      submitData.append('symbol', formData.symbol);
      submitData.append('description', formData.description);
      submitData.append('initialBuyAmountSol', formData.initialBuyAmountSol);

      if (formData.twitterUrl) {
        submitData.append('twitterUrl', formData.twitterUrl);
      }
      if (formData.websiteUrl) {
        submitData.append('websiteUrl', formData.websiteUrl);
      }
      if (formData.telegramUrl) {
        submitData.append('telegramUrl', formData.telegramUrl);
      }

      const response = await fetch('/api/launch-token', {
        method: 'POST',
        body: submitData,
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Launch failed');
      setResult(data.data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main style={pageStyle}>
      <a href="https://x.com/launchSquads/status/2007948623686807985" style={linkStyle}>[how it works]</a>
      
      {/* Form Section */}
      <div style={formSectionStyle}>
        {/* Hero Text - Left Aligned */}
        <div style={heroStyle}>
          <div style={titleStyle}>SQUADS</div>
          <div style={subtitleStyle}>spawn in internet companies in 1 click</div>
        </div>

        {/* Create Form Window */}
        <div style={{ ...windowStyle, width: '100%', maxWidth: 500 }}>
          <div style={titleBarStyle}>create.exe</div>
          <div style={{ padding: 14 }}>
            {error && <ErrorBox text={error} />}

            {result ? (
              <div>
                <Field label="Token Address" value={result.tokenMint} mono />
                <Field label="Transaction" value={result.signature} mono />
                <Win95Button label="View on Bags" onClick={() => window.open(result.bagsUrl)} />
                <Win95Button label="Launch Another" onClick={() => setResult(null)} />
              </div>
            ) : (
              <CreateTokenForm onSubmit={handleLaunch} isLoading={isLoading} />
            )}
          </div>
        </div>
      </div>

      {/* Token Grid */}
      <div style={{ width: '100%', marginTop: 40, paddingBottom: 40 }}>
        <TokenGrid />
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  backgroundColor: '#008080',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: 20,
  fontFamily: '"MS Sans Serif", "Segoe UI", Tahoma, sans-serif',
  position: 'relative',
};

const linkStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  color: '#fff',
  textDecoration: 'none',
  fontSize: 12,
};

const formSectionStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 500,
  paddingTop: 40,
};

const heroStyle: React.CSSProperties = {
  marginBottom: 20,
};

const titleStyle: React.CSSProperties = {
  fontSize: 36,
  fontWeight: 'bold',
  color: '#fff',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#fff',
  opacity: 0.9,
};