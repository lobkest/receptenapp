// Offline-ondersteuning, los van een bepaalde lijst. De boodschappenlijst-store gebruikt
// dit nu; recepten of de standaardlijst kunnen het later op dezelfde manier doen:
// - snapshot: laatste stand van de server + tijdstip (in localStorage)
// - wachtrij: offline acties die bij verbinding alsnog naar de server gaan
// - network: is er verbinding, en luisteren naar 'online'/'offline'
// localStorage is hier alleen een kopie; de database blijft de bron van waarheid.
export { saveSnapshot, loadSnapshot } from './snapshot'
export { createActionQueue } from './queue'
export { isOffline, isNetworkError, watchConnectivity, formatSavedAt } from './network'
