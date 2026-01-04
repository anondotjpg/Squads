'use client';

import { useEffect, useState } from 'react';

interface Token {
  id: number;
  token_mint: string;
  name: string;
  symbol: string;
  description: string;
  metadata_uri?: string;
  bags_url: string;
  lifetime_fees_sol?: number;
  dao_created?: boolean;
  realm_address?: string;
  realms_url?: string;
  created_at: string;
}

interface TokenWithImage extends Token {
  image_url?: string;
}

const FEES_THRESHOLD = 2.5;

export default function TokenGrid() {
  const [tokens, setTokens] = useState<TokenWithImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchTokens() {
      try {
        const res = await fetch('/api/tokens');
        const data = await res.json();
        if (data.success && data.data) {
          setTokens(data.data);

          data.data.forEach(async (token: Token) => {
            if (token.metadata_uri) {
              try {
                const metaRes = await fetch(token.metadata_uri);
                if (metaRes.ok) {
                  const meta = await metaRes.json();
                  setTokens(prev =>
                    prev.map(t =>
                      t.id === token.id ? { ...t, image_url: meta.image } : t
                    )
                  );
                }
              } catch (e) {
                console.error('Failed to fetch metadata:', e);
              }
            }
          });
        }
      } catch (error) {
        console.error('Failed to fetch tokens:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTokens();
    const interval = setInterval(fetchTokens, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  const formatFees = (fees?: number) => {
    if (!fees) return '0';
    if (fees < 0.01) return fees.toFixed(3);
    if (fees < 1) return fees.toFixed(2);
    return fees.toFixed(2);
  };

  const getProgressPercent = (fees?: number) => {
    if (!fees || fees <= 0) return 0;
    if (fees >= FEES_THRESHOLD) return 100;
    return (fees / FEES_THRESHOLD) * 100;
  };

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>recent launches</div>
        <div style={loadingStyle}>Loading...</div>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>recent launches</div>
        <div style={emptyStyle}>No tokens launched yet. Be the first!</div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>recent launches</div>

      <div style={gridStyle}>
        {tokens.map(token => {
          const fees = token.lifetime_fees_sol || 0;
          const progressPercent = getProgressPercent(fees);
          const isComplete = fees >= FEES_THRESHOLD;
          const hasDAO = token.dao_created && token.realms_url;

          return (
            <div key={token.id} style={cardStyle}>
              {/* TOP ROW */}
              <div style={topRowStyle}>
                <a
                  href={token.bags_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={leftColumnStyle}
                >
                  <div style={imageContainerStyle}>
                    {token.image_url ? (
                      <img
                        src={token.image_url}
                        alt={token.name}
                        style={imageStyle}
                      />
                    ) : (
                      <div style={placeholderStyle}>?</div>
                    )}
                  </div>
                  <div style={addressStyle}>
                    {truncateAddress(token.token_mint)}
                  </div>
                </a>

                <div style={infoStyle}>
                  <div style={cardHeaderStyle}>
                    <a
                      href={token.bags_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={symbolLinkStyle}
                    >
                      ${token.symbol}
                    </a>
                    <span style={timeStyle}>
                      {formatTime(token.created_at)}
                    </span>
                  </div>

                  <div style={nameStyle}>{token.name}</div>

                  <div style={descStyle}>{token.description}</div>
                </div>
              </div>

              {/* PROGRESS BAR */}
              <div style={progressRowStyle}>
                <div style={progressBarBgStyle}>
                  <div
                    style={{
                      ...progressBarFillStyle,
                      width: `${progressPercent}%`,
                      backgroundColor: isComplete ? '#008000' : '#000080',
                    }}
                  />
                </div>
                <span style={progressTextStyle}>
                  {formatFees(fees)}/{FEES_THRESHOLD}
                </span>
              </div>

              {/* DAO STATUS */}
              {hasDAO ? (
                <a
                  href={token.realms_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={daoBadgeStyle}
                >
                  🏛️ DAO Active - View on Realms
                </a>
              ) : isComplete ? (
                <div style={daoPendingStyle}>
                  🏛️ DAO Creation Pending...
                </div>
              ) : (
                <div style={daoLockedStyle}>
                  🔒 DAO unlocks at {FEES_THRESHOLD} SOL
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────── styles ───────────────────────── */

const containerStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 860,
  margin: '0 auto',
  padding: 20,
};

const headerStyle: React.CSSProperties = {
  marginBottom: 12,
  fontSize: 14,
  color: '#fff',
  textTransform: 'lowercase',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: 12,
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#c0c0c0',
  borderTop: '2px solid #fff',
  borderLeft: '2px solid #fff',
  borderBottom: '2px solid #808080',
  borderRight: '2px solid #808080',
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const topRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
};

const leftColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
  textDecoration: 'none',
  color: 'inherit',
};

const imageContainerStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  backgroundColor: '#fff',
  border: '2px inset #808080',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};

const imageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

const placeholderStyle: React.CSSProperties = {
  color: '#808080',
  fontSize: 24,
  fontWeight: 'bold',
};

const infoStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const symbolLinkStyle: React.CSSProperties = {
  fontWeight: 'bold',
  color: '#000080',
  fontSize: 14,
  textDecoration: 'none',
};

const timeStyle: React.CSSProperties = {
  color: '#808080',
  fontSize: 10,
};

const nameStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: 12,
  color: '#000',
};

const descStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#444',
  lineHeight: 1.3,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

const progressRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const progressBarBgStyle: React.CSSProperties = {
  flex: 1,
  height: 12,
  backgroundColor: '#fff',
  border: '2px inset #808080',
  overflow: 'hidden',
};

const progressBarFillStyle: React.CSSProperties = {
  height: '100%',
  transition: 'width 0.3s ease',
};

const progressTextStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 'bold',
  color: '#000',
  whiteSpace: 'nowrap',
};

const addressStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#000080',
  fontFamily: 'monospace',
  textDecoration: 'underline',
};

const daoBadgeStyle: React.CSSProperties = {
  display: 'block',
  backgroundColor: '#008000',
  color: '#fff',
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 'bold',
  textAlign: 'center',
  textDecoration: 'none',
  border: '2px outset #00a000',
  cursor: 'pointer',
};

const daoPendingStyle: React.CSSProperties = {
  backgroundColor: '#808000',
  color: '#fff',
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 'bold',
  textAlign: 'center',
  border: '2px outset #a0a000',
};

const daoLockedStyle: React.CSSProperties = {
  backgroundColor: '#808080',
  color: '#c0c0c0',
  padding: '6px 10px',
  fontSize: 11,
  textAlign: 'center',
  border: '2px inset #606060',
};

const loadingStyle: React.CSSProperties = {
  textAlign: 'center',
  color: '#fff',
  padding: 20,
};

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  color: '#fff',
  padding: 20,
  fontStyle: 'italic',
};