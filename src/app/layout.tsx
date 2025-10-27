import "./globals.css";
import "katex/dist/katex.min.css";
import { Roboto, Open_Sans } from 'next/font/google';
import Providers from './providers';

// Configure the fonts
const roboto = Roboto({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-roboto',
});

const openSans = Open_Sans({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-open-sans',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-white dark:bg-gray-900">
      <body className={`${roboto.variable} ${openSans.variable} font-sans antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
