export default function MessageBubble({ message }) {
  if (message.media_url) {
    return (
      <div className="bubble-media">
        {message.media_type === 'video' ? (
          <video src={message.media_url} controls />
        ) : (
          <img src={message.media_url} alt="" />
        )}
        {message.body && <div className="caption">{message.body}</div>}
      </div>
    )
  }
  return <div className="bubble">{message.body}</div>
}
