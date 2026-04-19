import AuctionCard from "./AuctionCard";
import BankruptcySummaryCard from "./BankruptcySummaryCard";
import BoardCenterActions from "./BoardCenterActions";
import BoardCenterSummaryCard from "./BoardCenterSummaryCard";
import BoardPlayersGrid from "./BoardPlayersGrid";
import BoardTilesLayer from "./BoardTilesLayer";
import DrawnCardCard from "./DrawnCardCard";
import MortgageDeskCard from "./MortgageDeskCard";
import MovingTokensOverlay from "./MovingTokensOverlay";
import PropertyPurchaseDecision from "./PropertyPurchaseDecision";
import RecentEventsCard from "./RecentEventsCard";
import SelectedCellInspector from "./SelectedCellInspector";
import SelectedPlayerInspector from "./SelectedPlayerInspector";
import TradeDeskCard from "./TradeDeskCard";
import UpgradesDeskCard from "./UpgradesDeskCard";

function GameView({
  roomCode,
  turnNumber,
  playerId,
  boardRef = null,
  boardCenterSummaryProps,
  selectedCellInspectorProps = null,
  selectedPlayerInspectorProps = null,
  bankruptcySummaryProps = null,
  propertyPurchaseDecisionProps = null,
  boardCenterActionsProps = null,
  auctionCardProps = null,
  tradeDeskCardProps = null,
  mortgageDeskCardProps = null,
  upgradesDeskCardProps = null,
  recentEventsCardProps,
  drawnCard = null,
  boardTilesLayerProps,
  movingTokensOverlayProps = null,
  boardPlayersGridProps,
}) {
  const hasAuctionSpotlight = Boolean(auctionCardProps);
  const hasCenterSpotlightContent = Boolean(
    auctionCardProps || propertyPurchaseDecisionProps || boardCenterActionsProps,
  );

  return (
    <section className="game-card">
      <div className="room-card-header game-card-header">
        <div className="game-title-block">
          <p className="game-kicker">Live table</p>
          <h2>Game board</h2>
          <div className="game-meta-row">
            <span className="game-meta-pill">
              Room <strong>{roomCode}</strong>
            </span>
            <span className="game-meta-pill">
              Turn <strong>{turnNumber}</strong>
            </span>
          </div>
        </div>
        <p className="player-id game-player-id">
          Your player id: <strong>{playerId}</strong>
        </p>
      </div>

      <div className="game-table-layout">
        <aside className="game-player-rail">
          <div className="game-column-header">
            <p className="game-column-kicker">Table view</p>
            <h3>Players</h3>
            <p>Pick a player card to inspect them or prepare a trade target.</p>
          </div>
          <BoardPlayersGrid {...boardPlayersGridProps} />
        </aside>

        <section className="game-main-stage">
          <section className="monopoly-board-shell">
            <div ref={boardRef} className="monopoly-board">
              <section
                className={`board-center${hasAuctionSpotlight ? " has-auction-spotlight" : ""}`}
              >
                {hasCenterSpotlightContent && (
                  <div
                    className={`board-center-spotlight${
                      hasAuctionSpotlight ? " is-auction-active" : ""
                    }`}
                  >
                    {auctionCardProps && <AuctionCard {...auctionCardProps} />}
                    {propertyPurchaseDecisionProps && (
                      <PropertyPurchaseDecision {...propertyPurchaseDecisionProps} />
                    )}
                    {boardCenterActionsProps && <BoardCenterActions {...boardCenterActionsProps} />}
                  </div>
                )}
              </section>

              <BoardTilesLayer {...boardTilesLayerProps} />
              {movingTokensOverlayProps && <MovingTokensOverlay {...movingTokensOverlayProps} />}
            </div>
          </section>

          <div className="game-main-support">
            <BoardCenterSummaryCard {...boardCenterSummaryProps} />

            {selectedCellInspectorProps && (
              <SelectedCellInspector {...selectedCellInspectorProps} />
            )}

            {selectedPlayerInspectorProps && (
              <SelectedPlayerInspector {...selectedPlayerInspectorProps} />
            )}

            {bankruptcySummaryProps && <BankruptcySummaryCard {...bankruptcySummaryProps} />}

            {tradeDeskCardProps && <TradeDeskCard {...tradeDeskCardProps} />}

            {mortgageDeskCardProps && <MortgageDeskCard {...mortgageDeskCardProps} />}

            {upgradesDeskCardProps && <UpgradesDeskCard {...upgradesDeskCardProps} />}

            {drawnCard && <DrawnCardCard card={drawnCard} />}

            <RecentEventsCard {...recentEventsCardProps} />
          </div>
        </section>
      </div>
    </section>
  );
}

export default GameView;
