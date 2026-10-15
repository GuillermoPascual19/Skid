// Mensajes de error que ve el jugador (los del servidor y los de validar tableros
// y nombres). Este es el de referencia: los demás idiomas tienen las mismas claves.

export const errors = {
  // Sesión y cuenta
  noSession: 'Sin sesión',
  invalidSession: 'Sesión no válida',
  sessionExpired: 'Sesión caducada',
  googleNotConfigured: 'El login con Google no está configurado',
  invalidCredential: 'Credencial no válida',
  googleUnverified: 'No se pudo verificar la cuenta de Google',
  linkGoogleFirst: 'Vincula antes tu cuenta de Google: si no, no podrías volver a entrar',
  missingConfirmation: 'Falta la confirmación',
  unknownHat: 'Gorro desconocido',
  hatLocked: 'Aún no has desbloqueado ese gorro',
  nameRequired: 'Elige un nombre primero',
  nameLength: 'El nombre debe tener entre {min} y {max} caracteres',
  nameChars: "Usa solo letras, números, espacios y . _ ' - (empezando por letra o número)",
  nameTaken: 'Ese nombre (o uno que se ve igual) ya lo tiene otro jugador. Prueba con otro.',

  // Límites y peticiones
  tooManyRequests: 'Demasiadas peticiones. Espera un minuto.',
  tooManyAttempts: 'Demasiados intentos. Espera un minuto.',
  tooManyNewAccounts: 'Demasiadas cuentas nuevas seguidas. Espera un minuto.',
  tooManyAccountsToday: 'Se han creado demasiadas cuentas desde esta conexión hoy. Prueba mañana.',
  requestTooLarge: 'Petición demasiado grande',
  invalidBody: 'Petición no válida',
  notFound: 'No encontrado',
  internal: 'Error interno',

  // Partidas
  invalidLog: 'Registro de la partida no válido',
  logIncomplete: 'El registro no completa la partida',
  tooFast: 'Partida demasiado rápida para haberse jugado en el juego',

  // Reto diario
  invalidDay: 'Día no válido',
  invalidPeriod: 'Periodo no válido',
  periodLength: 'El periodo debe ser de 1 a 32 días',
  onlyToday: 'Solo se puede jugar el reto de hoy',
  improveOnlyToday: 'Solo se puede mejorar el reto de hoy',
  dailyNotStarted: 'No has empezado el reto de ese día',
  dailyAlreadyDone: 'Ya completaste este reto',
  dailyChangedElsewhere: 'La partida ha cambiado en otro dispositivo; vuelve a abrir el reto',
  finishTodayFirst: 'Termina el reto de hoy para ver la partida de tus amigos',
  friendNotFinished: 'Ese jugador no ha terminado este reto',
  noGhost: 'No hay partida que ver de ese jugador',
  pickAnotherPlayer: 'Elige a otro jugador',

  // Reto semanal
  invalidWeek: 'Semana no válida',
  weekOver: 'Esa semana ya ha terminado',
  weeklyNotStarted: 'No has empezado el reto de esta semana',

  // Jugadores y ligas
  playerNotFound: 'No existe ese jugador',
  tooManyFriends: 'Como mucho {n} amigos',
  cantFriendYourself: 'No puedes añadirte a ti mismo',
  alreadyFriends: 'Ya sois amigos',
  requestNotFound: 'Esa solicitud ya no existe',
  adminOnly: 'Solo para administradores',
  onlyLeagueProfiles: 'Solo puedes ver el perfil de tus amigos y de jugadores de tus ligas',
  onlyLeagueGames: 'Solo puedes ver partidas de tus amigos y de jugadores de tus ligas',
  leagueNameLength: 'El nombre de la liga debe tener entre {min} y {max} caracteres',
  leagueNotFound: 'No existe ninguna liga con ese código',
  notLeagueMember: 'No perteneces a esa liga',
  maxLeagues: 'Ya has creado {n} ligas, que es el máximo',
  leagueCreateFailed: 'No se pudo crear la liga',

  // Niveles de jugadores
  invalidSort: 'Orden no válido',
  levelNameLength: 'El nombre del nivel debe tener entre {min} y {max} caracteres',
  levelNotFound: 'Ese nivel ya no existe',
  levelHidden: 'Este nivel se ha ocultado por denuncias',
  noSuchOwnLevel: 'No tienes ningún nivel con ese id',
  maxLevels: 'Ya has publicado {n} niveles, que es el máximo. Borra alguno para publicar otro.',
  duplicateLevel: 'Ya hay un nivel publicado exactamente igual',
  beatItFirst: 'Antes de publicarlo tienes que superarlo tú',
  invalidReason: 'Motivo no válido',
  cantReportOwn: 'No puedes denunciar tus propios niveles',
  ratingRange: 'La valoración va de 1 a 5',
  cantRateOwn: 'No puedes valorar tus propios niveles',
  beatToRate: 'Supera el nivel para poder valorarlo',

  // Duelos
  duelNotFound: 'Ese duelo no existe',
  duelUnavailable: 'Este duelo ya no está disponible',
  invalidDifficulty: 'Dificultad no válida',
  invalidRival: 'Rival no válido',
  onlyLeagueRivals: 'Solo puedes retar por nombre a tus amigos y a jugadores de tus ligas',
  maxDuels: 'Ya tienes {n} duelos en marcha. Espera a que terminen.',
  ownDuel: 'No puedes aceptar tu propio duelo',
  duelHasRival: 'Este duelo ya tiene rival',
  duelOver: 'Este duelo ya ha terminado',
  onlyChallengedCanDecline: 'Solo puede rechazarlo a quien retan',
  alreadyStarted: 'Ya has empezado a jugarlo',
  duelDeclined: 'Este duelo se rechazó',
  duelNoRival: 'Este duelo aún no tiene rival',
  duelHandedIn: 'Ya has terminado este duelo',
  finishBeforeHandIn: 'Termina el tablero al menos una vez antes de entregar',
  duelNotStarted: 'No has empezado este duelo',
  duelNotOver: 'El duelo aún no ha terminado',
  rivalDidntFinish: 'Tu rival no llegó a terminarlo',

  // Reacciones
  runNotFound: 'Esa partida no existe',
  runNotStarted: 'La partida aún no ha empezado',
  timeUp: 'Se acabó el tiempo',
  runChanged: 'La partida ha cambiado en otro dispositivo',
  pushDisabled: 'Las notificaciones no están disponibles',
  invalidSubscription: 'Suscripción no válida',
  reactionInvalid: 'Esa reacción no existe',
  reactionSelf: 'No puedes reaccionar a tu propio reto',
  reactionNotAllowed: 'Solo puedes reaccionar a retos terminados de tus amigos de los últimos {days} días',

  // Tableros (editor de niveles)
  board_empty: 'El tablero está vacío',
  board_rowWidth: 'La fila {row} mide {length} y debería medir {width}',
  board_manyPlayers: 'El tablero tiene más de un pingüino',
  board_duplicatePiece: 'La pieza {piece} está repetida',
  board_unknownChar: "Casilla desconocida '{char}' en ({x}, {y})",
  board_noPlayer: 'Falta el pingüino',
  board_noPieces: 'Falta al menos una pieza',
  board_missingPiece: 'Falta la pieza {piece}: deben ir de 1 a {count}',
  board_portalPair: 'Un teletransporte aparece {count} veces: tienen que ir por parejas',
  board_manyCracks: 'Demasiado hielo frágil: como mucho {max} casillas',
  board_manyBlocks: 'Demasiados bloques: como mucho {max}',
  board_invalid: 'Tablero no válido',
  board_size: 'El tablero debe medir entre {min}×{min} y {maxWidth}×{maxHeight}',
  board_loops: 'Hay corrientes que forman un bucle sin fin',
  board_unsolvable: 'El nivel no tiene solución',
  board_tooEasy: 'Demasiado fácil: se resuelve en un movimiento',
};

export type ErrorKey = keyof typeof errors;
export type ErrorMessages = Record<ErrorKey, string>;
