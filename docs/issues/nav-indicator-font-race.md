# Issue : position initiale de l'indicateur de navigation dépendante du chargement des polices

**Statut :** ouverte, préexistante (présente au tag `wtx-baseline-pre-refactor`), non corrigée.
**Constatée le :** 2026-10-03, pendant la vérification visuelle de la phase 1.

## Constat

`init()` positionne `#navActiveIndicator` par `requestAnimationFrame(updateActiveIndicator)`. La fonction mesure `getBoundingClientRect()` de l'élément de navigation actif. Si les polices web (Google Fonts : Space Grotesk, Inter) ne sont pas encore chargées à ce moment, la mesure est prise avec la police de secours. Rien ne remesure l'indicateur une fois les polices chargées : seuls `showView()` et l'événement `resize` le font.

Mesures à 1000 px de large, vue Dashboard, page de référence monolithique : 30 px ou 31 px selon le chargement. Après `document.fonts.ready` suivi de `updateActiveIndicator()`, la valeur est toujours 31 px.

## Effet

L'indicateur de la vue active peut être décalé d'environ 1 px au démarrage, jusqu'au premier changement de vue ou redimensionnement.

## Correctif possible (non appliqué)

Appeler `updateActiveIndicator()` après `document.fonts.ready`. C'est un changement de comportement, à décider séparément.
