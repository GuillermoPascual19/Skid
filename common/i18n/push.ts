// Textos de las notificaciones push, en el idioma de cada dispositivo. Los manda
// el servidor (backend/src/push.ts), así que no están en los diccionarios del juego.

import type { Locale } from './locales.ts';

export type PushKind = 'duelChallenge' | 'duelAccepted' | 'duelWaiting' | 'reaction' | 'streak' | 'test';

type Texts = Record<PushKind, { title: string; body: string }>;

export const PUSH_TEXTS: Record<Locale, Texts> = {
  es: {
    duelChallenge: { title: '⚔️ {name} te reta a un duelo', body: 'Entra en la sala y empezad a la vez.' },
    duelAccepted: { title: '⚔️ {name} ha aceptado tu duelo', body: 'Entra en la sala para jugar.' },
    duelWaiting: { title: '⚔️ {name} te espera en la sala', body: 'Entra y pulsad los dos Empezar.' },
    reaction: { title: '{emoji} {name} ha reaccionado a tu reto', body: 'Mira el ranking de hoy.' },
    streak: { title: '🔥 Tu racha te espera', body: 'Juega el reto de hoy antes de medianoche para no perderla.' },
    test: { title: "🔔 ¡Las notificaciones funcionan!", body: "Así te avisaremos de duelos, reacciones y tu racha." },
  },
  en: {
    duelChallenge: { title: '⚔️ {name} challenges you to a duel', body: 'Enter the room and start together.' },
    duelAccepted: { title: '⚔️ {name} accepted your duel', body: 'Enter the room to play.' },
    duelWaiting: { title: '⚔️ {name} is waiting for you in the room', body: 'Go in and both press Start.' },
    reaction: { title: '{emoji} {name} reacted to your challenge', body: "Check today's ranking." },
    streak: { title: '🔥 Your streak is waiting', body: "Play today's challenge before midnight so you don't lose it." },
    test: { title: "🔔 Notifications are working!", body: "This is how we'll tell you about duels, reactions and your streak." },
  },
  de: {
    duelChallenge: { title: '⚔️ {name} fordert dich zum Duell heraus', body: 'Betritt den Raum und startet gemeinsam.' },
    duelAccepted: { title: '⚔️ {name} hat dein Duell angenommen', body: 'Betritt den Raum, um zu spielen.' },
    duelWaiting: { title: '⚔️ {name} wartet im Raum auf dich', body: 'Komm rein und tippt beide auf Starten.' },
    reaction: { title: '{emoji} {name} hat auf deine Herausforderung reagiert', body: 'Schau dir die heutige Rangliste an.' },
    streak: { title: '🔥 Deine Serie wartet', body: 'Spiel die heutige Herausforderung vor Mitternacht, damit du sie nicht verlierst.' },
    test: { title: "🔔 Benachrichtigungen funktionieren!", body: "So erfährst du von Duellen, Reaktionen und deiner Serie." },
  },
  fr: {
    duelChallenge: { title: '⚔️ {name} te défie en duel', body: 'Entre dans la salle et commencez ensemble.' },
    duelAccepted: { title: '⚔️ {name} a accepté ton duel', body: 'Entre dans la salle pour jouer.' },
    duelWaiting: { title: "⚔️ {name} t'attend dans la salle", body: 'Entre et touchez tous les deux Commencer.' },
    reaction: { title: '{emoji} {name} a réagi à ton défi', body: 'Regarde le classement du jour.' },
    streak: { title: "🔥 Ta série t'attend", body: 'Joue le défi du jour avant minuit pour ne pas la perdre.' },
    test: { title: "🔔 Les notifications fonctionnent !", body: "C'est ainsi qu'on te préviendra des duels, des réactions et de ta série." },
  },
  pt: {
    duelChallenge: { title: '⚔️ {name} desafia-te para um duelo', body: 'Entra na sala e comecem ao mesmo tempo.' },
    duelAccepted: { title: '⚔️ {name} aceitou o teu duelo', body: 'Entra na sala para jogar.' },
    duelWaiting: { title: '⚔️ {name} está à tua espera na sala', body: 'Entra e toquem os dois em Começar.' },
    reaction: { title: '{emoji} {name} reagiu ao teu desafio', body: 'Vê a classificação de hoje.' },
    streak: { title: '🔥 A tua sequência espera por ti', body: 'Joga o desafio de hoje antes da meia-noite para não a perderes.' },
    test: { title: "🔔 As notificações funcionam!", body: "É assim que te vamos avisar de duelos, reações e da tua sequência." },
  },
  it: {
    duelChallenge: { title: '⚔️ {name} ti sfida a duello', body: 'Entra nella sala e iniziate insieme.' },
    duelAccepted: { title: '⚔️ {name} ha accettato il tuo duello', body: 'Entra nella sala per giocare.' },
    duelWaiting: { title: '⚔️ {name} ti aspetta nella sala', body: 'Entra e toccate entrambi Inizia.' },
    reaction: { title: '{emoji} {name} ha reagito alla tua sfida', body: 'Guarda la classifica di oggi.' },
    streak: { title: '🔥 La tua serie ti aspetta', body: 'Gioca la sfida di oggi prima di mezzanotte per non perderla.' },
    test: { title: "🔔 Le notifiche funzionano!", body: "Così ti avviseremo di duelli, reazioni e della tua serie." },
  },
  ru: {
    duelChallenge: { title: '⚔️ {name} вызывает тебя на дуэль', body: 'Зайди в комнату и начните одновременно.' },
    duelAccepted: { title: '⚔️ {name} принимает твой вызов', body: 'Зайди в комнату, чтобы играть.' },
    duelWaiting: { title: '⚔️ {name} ждёт тебя в комнате', body: 'Заходи, и нажмите оба «Начать».' },
    reaction: { title: '{emoji} {name}: реакция на твоё испытание', body: 'Загляни в сегодняшний рейтинг.' },
    streak: { title: '🔥 Твоя серия ждёт', body: 'Сыграй сегодняшнее испытание до полуночи, чтобы не потерять её.' },
    test: { title: "🔔 Уведомления работают!", body: "Так мы будем сообщать о дуэлях, реакциях и твоей серии." },
  },
};
