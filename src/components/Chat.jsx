import React, { useState, useEffect, useRef } from "react";

function Chat({ socket, gameId, playerName, game }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const chatRef = useRef(null);

  useEffect(() => {
    socket.on("chatMessage", (data) => {
      setMessages((prev) => [...prev, `${data.name}: ${data.message}`]);
    });

    socket.on("mafiaChat", (data) => {
      const isMafia =
        game.players.find((p) => p.name === playerName)?.role === "Mafia" ||
        game.players.find((p) => p.name === playerName)?.role === "Godfather";
      if (isMafia) {
        const senderRole = game.players.find((p) => p.name === data.name)?.role;
        const prefix = senderRole === "Godfather" ? "[Godfather]" : "[Mafia]";
        setMessages((prev) => [
          ...prev,
          `${prefix} ${data.name}: ${data.message}`,
        ]);
      }
    });

    return () => {
      socket.off("chatMessage");
      socket.off("mafiaChat");
    };
  }, [socket, game, playerName]);

  useEffect(() => {
    chatRef.current?.scrollTo(0, chatRef.current.scrollHeight);
  }, [messages]);

  const sendMessage = () => {
    if (input.trim()) {
      socket.emit("chatMessage", { gameId, name: playerName, message: input });
      setInput("");
    }
  };

  const player = game.players.find((p) => p.name === playerName);
  const isMafia = player?.role === "Mafia" || player?.role === "Godfather";
  const isAlive = player?.isAlive;

  // Hide chat input for dead players or during inappropriate phases
  const canChat =
    isAlive &&
    (game.currentPhase === "day" ||
      (game.currentPhase === "nightMafia" && isMafia));

  return (
    <div className="bg-gray-900 bg-opacity-90 p-6 rounded-xl shadow-lg border border-gray-700">
      <h3 className="text-2xl font-bold mb-4 text-white">Chat</h3>
      <div
        ref={chatRef}
        className="h-48 overflow-y-auto mb-4 bg-gray-800 text-white p-4 rounded-lg shadow-inner"
      >
        {messages.map((msg, index) => (
          <p key={index} className="text-sm mb-1">
            {msg.startsWith("[Mafia]") ? (
              <span className="text-red-400">{msg}</span>
            ) : msg.startsWith("[Godfather]") ? (
              <span className="text-purple-400">{msg}</span>
            ) : (
              <span className="text-gray-200">{msg}</span>
            )}
          </p>
        ))}
      </div>
      {canChat && (
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            className="flex-1 p-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner"
            placeholder={
              game.currentPhase === "nightMafia" && isMafia
                ? "Mafia chat..."
                : "Type a message..."
            }
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition shadow-md"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}

export default Chat;
