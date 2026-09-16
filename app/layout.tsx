import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Daymark — Your lists, in order',description:'Plan your days, keep priorities in view, and save what matters.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
