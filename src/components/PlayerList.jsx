import React from "react";
import { GiDevilMask } from "react-icons/gi";
import { IoLogoFreebsdDevil  } from "react-icons/io";

function PlayerList({ players, currentPlayer, playerRole, mafiaGang }) {
  const isMafia = playerRole === "Mafia" || playerRole === "Godfather";
  const currentPlayerData = players.find((p) => p.name === currentPlayer);
  const isDead = !currentPlayerData?.isAlive;

  // Use players as-is since assignRoles preserves join order; no shuffle needed unless backend reorders
  const displayPlayers = players;

  return (
    <div className="bg-gray-900 bg-opacity-90 p-4 sm:p-6 rounded-xl shadow-xl border border-gray-700">
      <h3 className="text-xl sm:text-2xl font-bold mb-4 text-white">
        Players: <span className="text-green-400">{players.length}</span>
      </h3>
      <ul className="space-y-2 sm:space-y-3">
        {displayPlayers.map((player, index) => {
          const isGangMember = mafiaGang.includes(player.name);
          const isGodfather =
            player.role === "Godfather" && isMafia && isGangMember;
          const isRegularMafia =
            player.role === "Mafia" && isMafia && isGangMember;

          return (
            <li
              key={player.name} // Use name for stable key
              className={`flex items-center gap-2 sm:gap-3 text-white ${
                player.name === currentPlayer ? "font-bold text-yellow-300" : ""
              } ${!player.isAlive ? "line-through text-gray-500" : ""}`}
            >
              <span
                className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full ${
                  player.isReady ? "bg-green-500" : "bg-red-500"
                } shadow-md`}
              ></span>
              <span className="text-xs sm:text-sm">{player.name}</span>
              {player.name === currentPlayer && playerRole && (
                <span className="text-gray-300 ml-1 sm:ml-2 text-xs sm:text-sm">
                  — {playerRole} 
                </span>
              )}
              {(isMafia || isDead) && isGangMember && (
                <span
                  className={`ml-1 sm:ml-2 font-semibold px-1 sm:px-2 rounded-full shadow-md text-xs sm:text-sm ${
                    isGodfather
                      ? "text-purple-400 bg-purple-900 bg-opacity-50"
                      : isRegularMafia
                      ? "text-red-400 bg-red-900 bg-opacity-50"
                      : ""
                  }`}
                >
                  {isGodfather ? (
                    <div className="flex items-center justify-end">
                      <IoLogoFreebsdDevil  color="white" size={20} />
                      <span className="text-purple-400">[Godfather]</span>
                    </div>
                  ) : isRegularMafia ? (
                    <div className="flex items-center justify-end gap-4">
                      <GiDevilMask color="white" size={20} />
                      <span className="text-red-400">[Mafia]</span>
                    </div>
                  ) : (
                    ""
                  )}
                </span>
              )}
              {!player.isAlive && (
                <span className="ml-1 sm:ml-2 text-gray-500 text-xs sm:text-sm">
                  [Dead]
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PlayerList;
