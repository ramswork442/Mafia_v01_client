import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import io from "socket.io-client";
import { FaWhatsapp } from "react-icons/fa";
import {
  SOCKET_URL,
  createGame,
  joinGame,
  setReady,
  setUnready,
  mafiaVote,
  investigate,
  save,
  dayVote,
} from "../api/api";
import PlayerList from "../components/PlayerList";
import ActionPanel from "../components/ActionPanel";
import Chat from "../components/Chat";
import AudioChat from "../components/AudioChat";

console.log("Connecting to SOCKET_URL:", SOCKET_URL);

const socket = io(SOCKET_URL);

function Home() {
  const { gameId: urlGameId } = useParams();
  const navigate = useNavigate();
  const [gameId, setGameId] = useState(urlGameId || "");
  console.log("urlGameId:", urlGameId, "gameId:", gameId);
  const [playerName, setPlayerName] = useState("");
  const [game, setGame] = useState(null);
  const [message, setMessage] = useState("");
  const [selectedTarget, setSelectedTarget] = useState("");
  const [startCountdown, setStartCountdown] = useState(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [audioActive, setAudioActive] = useState(false);
  const [role, setRole] = useState(null);
  const [mafiaGang, setMafiaGang] = useState([]);
  const [showRoleAnimation, setShowRoleAnimation] = useState(false);
  const [phaseAnimation, setPhaseAnimation] = useState(null);
  const [hasMafiaVoted, setHasMafiaVoted] = useState(false);
  const [hasDayVoted, setHasDayVoted] = useState(false);
  const [voteCounts, setVoteCounts] = useState({});
  const [mafiaVotes, setMafiaVotes] = useState({});
  const [killedByMafia, setKilledByMafia] = useState(null);
  const [gameOverMafiaReveal, setGameOverMafiaReveal] = useState(null);

  // Join room if URL contains gameId
  useEffect(() => {
    if (urlGameId && !hasJoined) {
      console.log("Emitting joinRoom for gameId:", urlGameId);
      socket.emit("joinRoom", { gameId: urlGameId });
    }
  }, [urlGameId, hasJoined]);

  // Socket event listeners
  useEffect(() => {
    const listeners = {
      gameUpdated: (data) => {
        console.log(data);

        setGame(data);
        if (data.currentPhase === "day") {
          const counts = {};
          // Safely handle players array
          (data.players || []).forEach((p) => (counts[p.name] = 0));
          const votes = data.votes || {};
          Object.values(votes).forEach((target) => {
            if (counts[target] !== undefined) counts[target]++;
          });
          setVoteCounts(counts);
          if (data.lastKilled) {
            setKilledByMafia(data.lastKilled);
            setTimeout(() => setKilledByMafia(null), 3000);
          }
        } else {
          setVoteCounts({});
          setAudioActive(false);
        }
        if (data.currentPhase === "nightMafia") setHasMafiaVoted(false);
        if (data.currentPhase === "day") setHasDayVoted(false);
      },
      playerJoined: ({ name }) => setMessage(`${name} has joined`),
      playerReady: ({ name }) => setMessage(`${name} is ready`),
      playerUnready: ({ name }) => {
        setMessage(`${name} is not ready`);
        setStartCountdown(null);
      },
      startCountdown: ({ countdown }) => setStartCountdown(countdown),
      gameStarted: (data) => {
        setGame(data);
        setMessage("Game started!");
        setStartCountdown(null);
        setShowRoleAnimation(true);
        setTimeout(() => {
          setShowRoleAnimation(false);
          setPhaseAnimation("City goes to sleep");
          setTimeout(() => setPhaseAnimation(null), 3000);
        }, 3000);
      },
      playerEliminated: ({ name }) => setMessage(`${name} was eliminated`),
      nightResult: ({ msg }) => {
        setPhaseAnimation(msg);
        setTimeout(() => setPhaseAnimation(null), 3000);
      },
      phaseChanged: ({ phase, lastKilled }) => {
        if (phase === "nightMafia") {
          setPhaseAnimation(
            <div className="text-5xl font-extrabold text-white animate-fade-in-out bg-gradient-to-r from-purple-500 to-red-500 bg-clip-text">
              City goes to sleep
            </div>
          );
        } else if (phase === "nightDetective") {
          setPhaseAnimation(
            <div className="text-5xl font-extrabold text-white animate-fade-in-out bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text">
              Detective investigates
            </div>
          );
        } else if (phase === "nightDoctor") {
          setPhaseAnimation(
            <div className="text-5xl font-extrabold text-white animate-fade-in-out bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text">
              Doctor saves
            </div>
          );
        } else if (phase === "day") {
          if (lastKilled) {
            setKilledByMafia(lastKilled);
            setPhaseAnimation(
              <div className="text-5xl font-extrabold text-transparent animate-fade-in-out bg-gradient-to-r from-red-600 to-red-800 bg-clip-text">
                City wakes up with a death of {lastKilled} (now it’s time for
                discussion)
              </div>
            );
            setTimeout(() => setKilledByMafia(null), 3000);
          } else {
            setPhaseAnimation(
              <div className="text-5xl font-extrabold text-transparent animate-fade-in-out bg-gradient-to-r from-green-500 to-green-700 bg-clip-text">
                City wakes up with no deaths (now it’s time for discussion)
              </div>
            );
          }
        }
        setTimeout(() => setPhaseAnimation(null), 3000);
      },
      gameOver: ({ winner }) => {
        setMessage(`${winner} wins!`);
        setPhaseAnimation(`${winner} Victory!`);
        setGame((prev) => ({ ...prev, state: "finished" }));
        setTimeout(() => {
          setPhaseAnimation(null);
          setGameOverMafiaReveal(mafiaGang); // Trigger mafia reveal animation
          setTimeout(() => setGameOverMafiaReveal(null), 5000); // Clear after 5s
        }, 3000);
      },
      error: ({ message }) => setMessage(`Error: ${message}`),
      investigationResult: ({ target, result }) => {
        if (
          game?.players.find((p) => p.name === playerName)?.role === "Detective"
        ) {
          setMessage(
            <span
              className={result === "+ve" ? "text-red-400" : "text-green-400"}
            >
              Investigation: {target} is{" "}
              {result === "+ve" ? "Mafia" : "Not Mafia"}
            </span>
          );
        }
      },
      audioStarted: () => {
        console.log("Audio started event received"); // Debug
        setAudioActive(true);
      },
      audioStopped: () => {
        console.log("Audio stopped event received");
        setAudioActive(false); // Add this
      },
      mafiaVoteCast: ({ voter, target }) => {
        if (role === "Mafia" || role === "Godfather") {
          setMafiaVotes((prev) => ({ ...prev, [voter]: target }));
          const voterRole = game.players.find((p) => p.name === voter)?.role;
          setMessage(
            `${
              voterRole === "Godfather" ? "[Godfather]" : "[Mafia]"
            } ${voter} voted to kill ${target}`
          );
        }
      },
      dayVoteResult: ({ eliminated }) => {
        setPhaseAnimation(`${eliminated} was lynched by majority vote`);
        setTimeout(() => setPhaseAnimation(null), 3000);
      },
    };

    Object.entries(listeners).forEach(([event, handler]) =>
      socket.on(event, handler)
    );
    return () => Object.keys(listeners).forEach((event) => socket.off(event));
  }, [playerName, role, game]);

  // Role and mafia gang assignment
  useEffect(() => {
    socket.on(`privateRole`, ({ role }) => setRole(role));
    socket.on(`mafiaGang`, (gang) => setMafiaGang(gang));
    return () => {
      socket.off(`privateRole`);
      socket.off(`mafiaGang`);
    };
  }, []);

  // 10-second countdown for game start
  useEffect(() => {
    const timer =
      startCountdown > 0 &&
      setInterval(() => setStartCountdown((prev) => prev - 1), 1000);
    if (startCountdown === 0) setStartCountdown(null);
    return () => clearInterval(timer);
  }, [startCountdown]);

  // Game actions
  const handleCreateGame = async () => {
    try {
      const { data } = await createGame(8);
      setGameId(data.gameId);
      navigate(`/${data.gameId}`);
      socket.emit("joinRoom", { gameId: data.gameId });
      setMessage(`Room created: ${data.url}`);
    } catch {
      setMessage("Error creating game");
    }
  };

  const handleJoinGame = async () => {
    if (!playerName) return setMessage("Enter your name");
    try {
      await joinGame(gameId, playerName);
      socket.emit("joinGame", { gameId, playerName });
      setMessage(`Joined ${gameId} as ${playerName}`);
      setHasJoined(true);
    } catch {
      setMessage("Error joining game");
    }
  };

  const handleToggleReady = async () => {
    if (startCountdown !== null)
      return setMessage("Cannot change ready status during countdown");
    const isReady = game?.players.find((p) => p.name === playerName)?.isReady;
    try {
      await (isReady ? setUnready : setReady)(gameId, playerName);
    } catch {
      setMessage("Error toggling ready");
    }
  };

  const handleMafiaVote = async () => {
    if (!selectedTarget) return setMessage("Select a target");
    if (hasMafiaVoted) return setMessage("You have already voted");
    try {
      await mafiaVote(gameId, playerName, selectedTarget);
      setHasMafiaVoted(true);
      setSelectedTarget("");
      setMessage("Vote cast");
    } catch (err) {
      setMessage(`Error voting: ${err.response?.data?.msg || "Unknown error"}`);
    }
  };

  const handleInvestigate = async () => {
    if (!selectedTarget) return setMessage("Select a target");
    try {
      await investigate(gameId, playerName, selectedTarget);
      setSelectedTarget("");
    } catch (err) {
      setMessage(
        `Error investigating: ${err.response?.data?.msg || "Unknown error"}`
      );
    }
  };

  const handleSave = async () => {
    if (!selectedTarget) return setMessage("Select a target");
    try {
      await save(gameId, playerName, selectedTarget);
      setSelectedTarget("");
      setMessage("Player saved");
    } catch (err) {
      setMessage(`Error saving: ${err.response?.data?.msg || "Unknown error"}`);
    }
  };

  const handleDayVote = async () => {
    if (!selectedTarget) return setMessage("Select a target");
    if (hasDayVoted) return setMessage("You have already voted");
    try {
      await dayVote(gameId, playerName, selectedTarget);
      setHasDayVoted(true);
      setSelectedTarget("");
      setMessage("Vote cast");
    } catch (err) {
      setMessage(`Error voting: ${err.response?.data?.msg || "Unknown error"}`);
    }
  };

  return (
    <div
      className={`min-h-screen w-full flex flex-col transition-all duration-500 ${
        game?.currentPhase?.includes("night")
          ? "bg-gradient-to-b from-gray-900 to-black text-white"
          : "bg-gradient-to-b from-gray-200 to-white text-gray-800"
      }`}
    >
      <div className="flex-1 flex flex-col p-4 sm:p-6 max-w-4xl mx-auto w-full h-full">
        <h1 className="text-2xl sm:text-5xl text-center mb-4 animate-pulse bg-clip-text text-red-600">
          Mafia Night
        </h1>

        {/* Initial Room Creation/Join Section */}
        {!gameId && !game && (
        <div className="h-[80vh] flex flex-col justify-center">
          <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-xl h-[]">
            <button
              onClick={handleCreateGame}
              className="bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition text-sm sm:text-base w-full"
            >
              Create Room
            </button>
            {/* <input
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              placeholder="Enter Room ID"
              className="p-2 bg-gray-700 text-white rounded-lg focus:ring-2 focus:ring-red-500 text-sm sm:text-base w-full"
            />
            <button
              onClick={() => navigate(`/${gameId}`)}
              disabled={!gameId}
              className="bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition disabled:bg-gray-500 text-sm sm:text-base"
            >
              Join Room
            </button> */}
          </div>
        </div>
        )}

        {/* Player Name Entry Section */}
        {gameId && !hasJoined && game && (
          <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-xl border border-gray-700 w-full">
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Your Name"
              className="w-full p-4 bg-gray-700 text-white rounded-lg mb-4 focus:ring-2 focus:ring-green-500 text-sm sm:text-base"
            />
            <div className="flex items-center justify-center gap-4">
              {/* WhatsApp Share Button */}
              <a
                href={`https://api.whatsapp.com/send?text=Join%20the%20game:%20https://your-localtunnel-url.loca.lt/${gameId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-green-500 text-white py-2 px-4 rounded-lg hover:bg-green-600 transition w-full sm:w-auto"
              >
                <FaWhatsapp size={20} /> Share on WhatsApp
              </a>

              {/* Enter Game Button */}
              <button
                onClick={handleJoinGame}
                disabled={!playerName}
                className="bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition disabled:bg-gray-500 w-full sm:w-auto text-sm sm:text-base"
              >
                Enter Game
              </button>
            </div>
          </div>
        )}

        {/* Main Game Interface */}
        {game && hasJoined && (
          <div className="flex-1 flex flex-col gap-4 sm:gap-6 w-full">
            {/* Game Info */}
            <div className="bg-gray-800 p-3 sm:p-4 rounded-xl shadow-xl border border-gray-700 w-full">
              <p className="text-sm sm:text-base text-white">
                Room ID:{" "}
                <span className="font-semibold text-red-400">
                  {game.gameId}
                </span>
              </p>
              <p className="text-sm sm:text-base text-white">
                Phase:{" "}
                <span className="font-semibold text-yellow-400">
                  {game.currentPhase || "Waiting"}
                </span>
              </p>
              {game.state === "waiting" && (
                <div className="flex justify-between gap-2 sm:gap-4 mt-2 sm:mt-4 w-full">
                 {/* WhatsApp Share Button */}
              <a
                href={`https://api.whatsapp.com/send?text=Join%20the%20game:%20https://your-localtunnel-url.loca.lt/${gameId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-green-500 text-white py-2 px-4 rounded-lg hover:bg-green-600 transition sm:w-auto"
              >
                <FaWhatsapp size={20} /> Share on WhatsApp
              </a>
                  <button
                    onClick={handleToggleReady}
                    disabled={startCountdown !== null}
                    className={`py-1 px-2 sm:py-2 sm:px-4 rounded-lg text-white transition text-sm ${
                      startCountdown !== null
                        ? "bg-gray-600 cursor-not-allowed"
                        : game.players.find((p) => p.name === playerName)
                            ?.isReady
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-yellow-600 hover:bg-yellow-700"
                    }`}
                    title={
                      startCountdown !== null ? "Locked during countdown" : ""
                    }
                  >
                    {game.players.find((p) => p.name === playerName)?.isReady
                      ? "Unready"
                      : "Ready"}
                  </button>
                </div>
              )}
            </div>

            {/* Countdown */}
            {startCountdown && (
              <div className="text-lg sm:text-3xl font-bold text-center text-black animate-pulse">
                Game starting in {startCountdown}...
              </div>
            )}

            {/* Animations */}
            {phaseAnimation && (
              <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-90 z-50 p-4">
                <div className="text-center text-xl sm:text-5xl">
                  {phaseAnimation}
                </div>
              </div>
            )}
            {killedByMafia && (
              <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-40 p-4">
                <div className="text-lg sm:text-4xl font-bold text-red-600 animate-pulse text-center">
                  {killedByMafia} was killed by the Mafia!
                </div>
              </div>
            )}
            {showRoleAnimation && (
              <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-90 z-50 p-4">
                <div className="text-lg sm:text-4xl font-bold text-white animate-spin-card bg-gradient-to-r from-blue-500 to-green-500 bg-clip-text text-center">
                  Your Role: {role}
                </div>
              </div>
            )}
            {gameOverMafiaReveal && (
              <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-90 z-50 p-4">
                <div className="text-lg sm:text-4xl font-bold text-white animate-pulse text-center">
                  Mafia Gang: {gameOverMafiaReveal.join(", ")}
                </div>
              </div>
            )}

            {/* Message */}
            <p className="text-center text-red-400 font-semibold text-sm sm:text-base">
              {message}
            </p>

            {/* Game Components */}
            <div className="flex flex-col gap-4 sm:gap-6 w-full">
              <PlayerList
                players={game.players}
                currentPlayer={playerName}
                playerRole={role}
                mafiaGang={mafiaGang}
                className="w-full"
              />

              {(game.currentPhase === "nightMafia" &&
                (role === "Mafia" || role === "Godfather")) ||
              (game.currentPhase === "nightDetective" &&
                role === "Detective") ||
              (game.currentPhase === "nightDoctor" && role === "Doctor") ||
              game.currentPhase === "day" ? (
                <ActionPanel
                  game={game}
                  playerName={playerName}
                  selectedTarget={selectedTarget}
                  setSelectedTarget={setSelectedTarget}
                  hasMafiaVoted={hasMafiaVoted}
                  hasDayVoted={hasDayVoted}
                  mafiaVote={handleMafiaVote}
                  investigate={handleInvestigate}
                  save={handleSave}
                  dayVote={handleDayVote}
                  playerRole={role}
                  className="w-full"
                />
              ) : null}

              {game.currentPhase === "nightMafia" &&
                (role === "Mafia" || role === "Godfather") && (
                  <div className="bg-gray-800 p-3 sm:p-4 rounded-xl shadow-xl border border-gray-700 w-full">
                    <h3 className="text-lg sm:text-xl font-bold mb-2 text-white">
                      Mafia Votes:
                    </h3>
                    {Object.entries(mafiaVotes).map(([voter, target]) => (
                      <div
                        key={voter}
                        className="text-sm sm:text-lg text-white"
                      >
                        {voter} → {target}
                      </div>
                    ))}
                  </div>
                )}

              {game.currentPhase === "day" && (
                <div className="bg-gray-800 p-3 sm:p-4 rounded-xl shadow-xl border border-gray-700 w-full">
                  <h3 className="text-lg sm:text-xl font-bold mb-2 text-white">
                    Current Votes:
                  </h3>
                  {Object.entries(voteCounts).map(([name, count]) => (
                    <div key={name} className="text-sm sm:text-lg text-white">
                      {name}: {count} votes
                    </div>
                  ))}
                </div>
              )}

              <Chat
                socket={socket}
                gameId={gameId}
                playerName={playerName}
                game={game}
                className="w-full flex-1"
              />

              {audioActive && game.currentPhase === "day" && (
                <AudioChat
                  socket={socket}
                  gameId={gameId}
                  playerName={playerName}
                  game={game}
                  isAlive={
                    game.players.find((p) => p.name === playerName)?.isAlive
                  }
                  className="w-full"
                />
              )}
            </div>
          </div>
        )}
      </div>
      <p className="text-center p-4 text-red-400 font-semibold text-sm sm:text-base">
        {message}
      </p>
    </div>
  );
}

export default Home;
