import type { Metadata, Viewport } from 'next';
import '../globals.css';
import './room.css';

export const metadata: Metadata = {
  title: 'Oro · The Room',
  description: 'An interactive 3D bedroom: tap the beanbag to change its style. Concept preview.',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500&family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Manrope:wght@400;500;600;700&family=DM+Mono:wght@400;500&family=Galada&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
