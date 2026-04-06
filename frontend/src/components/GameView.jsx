import ActionGuideCard from "./ActionGuideCard";
import AuctionCard from "./AuctionCard";
import BankruptcySummaryCard from "./BankruptcySummaryCard";
import BoardCenterActions from "./BoardCenterActions";
import BoardCenterSummaryCard from "./BoardCenterSummaryCard";
import BoardPlayersGrid from "./BoardPlayersGrid";
import BoardTilesLayer from "./BoardTilesLayer";
import DrawnCardCard from "./DrawnCardCard";
import MortgageDeskCard from "./MortgageDeskCard";
import PendingPurchaseCard from "./PendingPurchaseCard";
import RecentEventsCard from "./RecentEventsCard";
import SelectedCellInspector from "./SelectedCellInspector";
import SelectedPlayerInspector from "./SelectedPlayerInspector";
import TradeDeskCard from "./TradeDeskCard";
import UpgradesDeskCard from "./UpgradesDeskCard";

function GameView({
  roomCode,
  turnNumber,
  playerId,
  boardCenterSummaryProps,
  actionGuideCardProps,
  selectedCellInspectorProps = null,
  selectedPlayerInspectorProps = null,
  bankruptcySummaryProps = null,
  boardCenterActionsProps,
  pendingPurchaseCardProps = null,
  auctionCardProps = null,
  tradeDeskCardProps = null,
  mortgageDeskCardProps = null,
  upgradesDeskCardProps = null,
  recentEventsCardProps,
  drawnCard = null,
  boardTilesLayerProps,
  boardPlayersGridProps,
}) {
  return (
    <section className="game-card">
      <div className="room-card-header">
        <div>
          <h2>Game</h2>
          <p>
            Room code: <strong>{roomCode}</strong>
          </p>
          <p>
            Turn: <strong>{turnNumber}</strong>
          </p>
        </div>
        <p className="player-id">Your player id: {playerId}</p>
      </div>

      <section className="monopoly-board-shell">
        <div className="monopoly-board">
          <section className="board-center">
            <BoardCenterSummaryCard {...boardCenterSummaryProps} />

            <ActionGuideCard {...actionGuideCardProps} />

            {selectedCellInspectorProps && (
              <SelectedCellInspector {...selectedCellInspectorProps} />
            )}

            {selectedPlayerInspectorProps && (
              <SelectedPlayerInspector {...selectedPlayerInspectorProps} />
            )}

            {bankruptcySummaryProps && <BankruptcySummaryCard {...bankruptcySummaryProps} />}

            <BoardCenterActions {...boardCenterActionsProps} />

            {pendingPurchaseCardProps && <PendingPurchaseCard {...pendingPurchaseCardProps} />}

            {auctionCardProps && <AuctionCard {...auctionCardProps} />}

            {tradeDeskCardProps && <TradeDeskCard {...tradeDeskCardProps} />}

            {mortgageDeskCardProps && <MortgageDeskCard {...mortgageDeskCardProps} />}

            {upgradesDeskCardProps && <UpgradesDeskCard {...upgradesDeskCardProps} />}

            <RecentEventsCard {...recentEventsCardProps} />

            {drawnCard && <DrawnCardCard card={drawnCard} />}
          </section>

          <BoardTilesLayer {...boardTilesLayerProps} />
        </div>
      </section>

      <BoardPlayersGrid {...boardPlayersGridProps} />
    </section>
  );
}

export default GameView;
