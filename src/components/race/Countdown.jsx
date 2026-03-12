import { useCountdown } from '../../hooks/useRaceWeekends'
import { getNextSession } from '../../lib/openf1'
import './Countdown.css'

export default function Countdown({ weekend }) {
  const session = getNextSession(weekend)
  const timeLeft = useCountdown(session?.start)

  if (!session) return null

  return (
    <div className="countdown-wrap">
      <div className="countdown-label">
        <span className="countdown-flag">{weekend.flag_emoji}</span>
        <span className="countdown-name">{weekend.name}</span>
        {weekend.is_sprint_weekend && (
          <span className="badge badge-sprint">Sprint</span>
        )}
      </div>

      <div className="countdown-session">
        Nächste Session: <strong>{session.label}</strong>
      </div>

      {timeLeft && !timeLeft.over ? (
        <div className="countdown-timer">
          <div className="countdown-unit">
            <span className="countdown-num">{String(timeLeft.days).padStart(2, '0')}</span>
            <span className="countdown-unit-label">Tage</span>
          </div>
          <span className="countdown-sep">:</span>
          <div className="countdown-unit">
            <span className="countdown-num">{String(timeLeft.hours).padStart(2, '0')}</span>
            <span className="countdown-unit-label">Std</span>
          </div>
          <span className="countdown-sep">:</span>
          <div className="countdown-unit">
            <span className="countdown-num">{String(timeLeft.minutes).padStart(2, '0')}</span>
            <span className="countdown-unit-label">Min</span>
          </div>
          <span className="countdown-sep">:</span>
          <div className="countdown-unit">
            <span className="countdown-num">{String(timeLeft.seconds).padStart(2, '0')}</span>
            <span className="countdown-unit-label">Sek</span>
          </div>
        </div>
      ) : (
        <div className="countdown-live">
          🔴 Session läuft gerade!
        </div>
      )}

      <div className="countdown-date">
        {new Date(session.start).toLocaleString('de-AT', {
          weekday: 'long', day: '2-digit', month: 'long',
          hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
        })}
      </div>
    </div>
  )
}
