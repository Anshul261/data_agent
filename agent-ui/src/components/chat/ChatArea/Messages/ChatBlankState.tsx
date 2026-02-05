'use client'

import { motion } from 'framer-motion'
import Icon from '@/components/ui/icon'
import React from 'react'

const SUGGESTED_QUESTIONS = [
  'Describe the tables ',
  'Show me tickets created in 2026',
  'What is the overall SLA Compliance?',
  'What interesting insights can I learn about my data?'
]

const ChatBlankState = () => {
  return (
    <section
      className="flex flex-col items-center text-center font-geist"
      aria-label="Welcome message"
    >
      <div className="flex max-w-3xl flex-col gap-y-8">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="flex items-center justify-center rounded-full bg-accent p-6">
            <Icon type="agent" size="lg" className="text-primary" />
          </div>
          <h1 className="text-4xl font-[600] tracking-tight text-foreground">
            Welcome to Data Agent
          </h1>
          <p className="text-lg text-muted">
            Your Rapid Data Access Assistant
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-muted">
            Ask me anything about IT support. Here are some suggestions:
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SUGGESTED_QUESTIONS.map((question, index) => (
              <motion.div
                key={question}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + index * 0.1 }}
                className="flex items-center gap-2 rounded-xl border border-primary/15 bg-accent/50 p-4 text-left text-sm text-muted transition-colors hover:border-primary/30 hover:bg-accent"
              >
                <Icon type="hammer" size="xs" className="shrink-0" />
                <span>{question}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="text-xs text-muted/70"
        >
          I have access to Manage Engine Analytics Data and can help you learn about your data quickly..
        </motion.p>
      </div>
    </section>
  )
}

export default ChatBlankState
