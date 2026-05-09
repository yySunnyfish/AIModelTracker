import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ModelTrack - AI 模型情报追踪平台',
  description: 'Global AI model intelligence - 追踪 LLM 和 Embodied AI 的发布、benchmark、定价和竞争格局',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
