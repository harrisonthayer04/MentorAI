import "./globals.css";
import "katex/dist/katex.min.css";
import { Plus_Jakarta_Sans, DM_Sans } from 'next/font/google';
import Providers from './providers';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MentorAI',
  description: 'Your AI-powered mentor for learning and growth',
  icons: {
    icon: '/favicon.svg',
  },
};

// Configure distinctive modern fonts
const plusJakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
});

const dmSans = DM_Sans({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${plusJakarta.variable} ${dmSans.variable} font-sans antialiased bg-zinc-950`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
