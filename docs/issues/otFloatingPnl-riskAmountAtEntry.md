# Issue : `otFloatingPnl` n'utilise pas `riskAmountAtEntry`

**Statut :** ouverte, non corrigée volontairement. Le refactoring conserve le comportement actuel tant qu'aucune correction métier n'a été décidée.
**Constatée le :** 2026-10-02, pendant l'audit d'architecture (référence `wtx-baseline-pre-refactor`).

## Comportement actuel

`otFloatingPnl(ot)` calcule le P&L flottant d'une position en cours ainsi :

```js
const capNow = /* capital du dernier point de buildSeries(), ou SETTINGS.capitalInitial */;
// position Multi-TP (≥ 2 TP) :
return (ot.realizedPnL || 0) + capNow * ((ot.risk||0)/100) * floatingRRemaining;
// sinon :
return capNow * ((ot.risk||0)/100) * otFloatingR(ot);
```

## Écart avec les règles du moteur

Le moteur repose sur le principe suivant : `capitalAtEntry` et `riskAmountAtEntry` sont figés à l'ouverture réelle (`savePosition`, `triggerPendingTrade`), et `realizedR = realizedPnL / riskAmountAtEntry` (`computeRealizedRFromPnL`). `otFloatingPnl` s'en écarte de trois façons :

1. Il utilise le capital **actuel** × risque %, et non `riskAmountAtEntry`. Le P&L flottant affiché dérive donc dès que le capital change après l'ouverture.
2. Il applique `(ot.realizedPnL || 0)` et `(ot.risk || 0)` : une valeur inconnue devient silencieusement `0`, alors que partout ailleurs une valeur inconnue reste `null`.
3. Il recalcule `buildSeries()` à chaque appel, pour chaque position ouverte et toutes les 30 s.

`otFloatingR` présente le même motif `ot.realizedR || 0`.

## Portée

Seul l'affichage des positions en cours est concerné. Le P&L réalisé à la clôture (`confirmCloseTrade`) est calculé séparément et n'est pas touché.

## Garde-fou

Le comportement actuel est figé dans `tests/baseline/characterize.js` (groupes `otFloatingR` et `otFloatingPnl`). Une correction devra être une décision explicite, suivie de `npm run test:update-baseline` dans un commit dédié.
