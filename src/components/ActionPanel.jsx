import React from 'react';

function ActionPanel({
  game,
  playerName,
  selectedTarget,
  setSelectedTarget,
  hasMafiaVoted,
  hasDayVoted,
  mafiaVote,
  investigate,
  save,
  dayVote,
  playerRole,
}) {
  const player = game?.players.find((p) => p.name === playerName);
  const isMafia = playerRole === 'Mafia' || playerRole === 'Godfather';
  const isDetective = playerRole === 'Detective';
  const isDoctor = playerRole === 'Doctor';
  const isAlive = player?.isAlive;

  if (game.state !== 'inProgress' || !isAlive) return null;

  const showPanel =
    (game.currentPhase === 'nightMafia' && isMafia) ||
    (game.currentPhase === 'nightDetective' && isDetective) ||
    (game.currentPhase === 'nightDoctor' && isDoctor) ||
    game.currentPhase === 'day';

  if (!showPanel) return null;

  return (
    <div className="bg-gray-900 bg-opacity-90 p-4 sm:p-6 rounded-xl shadow-xl border border-gray-700">
      <h3 className="text-xl sm:text-2xl font-bold mb-4 text-white">Actions</h3>
      <select
        value={selectedTarget}
        onChange={(e) => setSelectedTarget(e.target.value)}
        className="w-full p-2 sm:p-3 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4 shadow-inner text-xs sm:text-sm"
      >
        <option value="" className="text-gray-400">Select a target</option>
        {game.players.filter((p) => p.isAlive).map((p, index) => (
          <option key={index} value={p.name} className="text-white">{p.name}</option>
        ))}
      </select>
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {game.currentPhase === 'nightMafia' && isMafia && (
          <button
            onClick={mafiaVote}
            disabled={hasMafiaVoted || !selectedTarget}
            className="bg-red-600 text-white py-2 px-3 sm:px-4 rounded-lg hover:bg-red-700 transition disabled:bg-gray-600 shadow-md text-xs sm:text-sm"
          >
            Vote to Kill
          </button>
        )}
        {game.currentPhase === 'nightDetective' && isDetective && (
          <button
            onClick={investigate}
            disabled={!selectedTarget}
            className="bg-blue-600 text-white py-2 px-3 sm:px-4 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-600 shadow-md text-xs sm:text-sm"
          >
            Investigate
          </button>
        )}
        {game.currentPhase === 'nightDoctor' && isDoctor && (
          <button
            onClick={save}
            disabled={!selectedTarget}
            className="bg-purple-600 text-white py-2 px-3 sm:px-4 rounded-lg hover:bg-purple-700 transition disabled:bg-gray-600 shadow-md text-xs sm:text-sm"
          >
            Save
          </button>
        )}
        {game.currentPhase === 'day' && (
          <button
            onClick={dayVote}
            disabled={hasDayVoted || !selectedTarget}
            className="bg-yellow-600 text-white py-2 px-3 sm:px-4 rounded-lg hover:bg-yellow-700 transition disabled:bg-gray-600 shadow-md text-xs sm:text-sm"
          >
            Vote
          </button>
        )}
      </div>
    </div>
  );
}

export default ActionPanel;