'use client'

import ChatInput from './ChatInput'
import ImageArtifactsPanel from './ImageArtifactsPanel'
import MessageArea from './MessageArea'
const ChatArea = () => {
  return (
    <main className="relative m-1.5 flex flex-grow overflow-hidden rounded-xl bg-background">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <MessageArea />
        <div className="sticky bottom-0 ml-9 px-4 pb-2">
          <ChatInput />
        </div>
      </div>
      <ImageArtifactsPanel />
    </main>
  )
}

export default ChatArea
