import React from "react";
import PropTypes from "prop-types";
import { FormattedMessage, FormattedRelativeTime, defineMessages, useIntl } from "react-intl";
import { Sidebar } from "../sidebar/Sidebar";
import { CloseButton } from "../input/CloseButton";
import { Button } from "../input/Button";
import { ToggleInput } from "../input/ToggleInput";
import { ReactComponent as HandRaisedIcon } from "../icons/HandRaised.svg";
import styles from "./TeacherHudSidebar.scss";

const lockLabels = defineMessages({
  voice_chat: { id: "teacher-hud.lock.voice-chat", defaultMessage: "Learners can talk" },
  text_chat: { id: "teacher-hud.lock.text-chat", defaultMessage: "Learners can chat" },
  spawn_and_move_media: { id: "teacher-hud.lock.media", defaultMessage: "Learners can add & move objects" },
  spawn_drawing: { id: "teacher-hud.lock.drawing", defaultMessage: "Learners can draw" },
  fly: { id: "teacher-hud.lock.fly", defaultMessage: "Learners can fly" }
});

export const HUD_LOCKS = Object.keys(lockLabels);

export function TeacherHudSidebar({
  learnerCount,
  lectureMode,
  seatLocked,
  permissions,
  handQueue,
  now,
  seatCount,
  onClose,
  onLectureMode,
  onMuteAll,
  onGather,
  onSeatLock,
  onTogglePermission
}) {
  const intl = useIntl();
  return (
    <Sidebar
      title={<FormattedMessage id="teacher-hud.title" defaultMessage="Teacher Controls" />}
      beforeTitle={<CloseButton onClick={onClose} />}
    >
      <div className={styles.content}>
        <section className={styles.section}>
          <Button
            preset={lectureMode ? "cancel" : "accept"}
            className={styles.lectureButton}
            onClick={() => onLectureMode(!lectureMode)}
          >
            {lectureMode ? (
              <FormattedMessage id="teacher-hud.lecture.end" defaultMessage="End Lecture Mode" />
            ) : (
              <FormattedMessage id="teacher-hud.lecture.start" defaultMessage="Start Lecture Mode" />
            )}
          </Button>
          <p className={styles.hint}>
            <FormattedMessage
              id="teacher-hud.lecture.hint"
              defaultMessage="Mutes learners, stops chat and objects, and seats everyone. Also saves learners' mobile data."
            />
          </p>
          <p className={styles.status}>
            <FormattedMessage
              id="teacher-hud.learner-count"
              defaultMessage="{count, plural, =0 {No learners in the room} one {# learner in the room} other {# learners in the room}}"
              values={{ count: learnerCount }}
            />
          </p>
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>
            <FormattedMessage id="teacher-hud.class.heading" defaultMessage="Class" />
          </h3>
          <div className={styles.buttonRow}>
            <Button preset="basic" sm onClick={onMuteAll} disabled={!learnerCount}>
              <FormattedMessage id="teacher-hud.mute-all" defaultMessage="Mute all" />
            </Button>
            <Button preset="basic" sm onClick={() => onGather({ toSeats: true })} disabled={!learnerCount}>
              <FormattedMessage id="teacher-hud.gather-seats" defaultMessage="Gather to seats" />
            </Button>
            <Button preset="basic" sm onClick={() => onGather({ toSeats: false })} disabled={!learnerCount}>
              <FormattedMessage id="teacher-hud.gather-podium" defaultMessage="Gather to podium" />
            </Button>
          </div>
          {seatCount < learnerCount && (
            <p className={styles.warning}>
              <FormattedMessage
                id="teacher-hud.not-enough-seats"
                defaultMessage="Only {seats} seats in this scene — extra learners go to the podium."
                values={{ seats: seatCount }}
              />
            </p>
          )}
          <ToggleInput
            checked={seatLocked}
            onChange={e => onSeatLock(e.target.checked)}
            label={<FormattedMessage id="teacher-hud.seat-lock" defaultMessage="Lock learners in their seats" />}
          />
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>
            <FormattedMessage
              id="teacher-hud.hands.heading"
              defaultMessage="Raised hands ({count})"
              values={{ count: handQueue.length }}
            />
          </h3>
          {handQueue.length === 0 ? (
            <p className={styles.hint}>
              <FormattedMessage id="teacher-hud.hands.empty" defaultMessage="No raised hands." />
            </p>
          ) : (
            <ol className={styles.handQueue}>
              {handQueue.map((entry, i) => (
                <li key={entry.id} className={styles.handEntry}>
                  <span className={styles.handPosition}>{i + 1}</span>
                  <HandRaisedIcon width={16} height={16} />
                  <span className={styles.handName}>{entry.name}</span>
                  <span className={styles.handTime}>
                    <FormattedRelativeTime
                      value={Math.round((entry.since - now) / 1000)}
                      numeric="auto"
                      unit="second"
                    />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.section}>
          <h3 className={styles.heading}>
            <FormattedMessage id="teacher-hud.permissions.heading" defaultMessage="Learner permissions" />
          </h3>
          {HUD_LOCKS.map(key => (
            <ToggleInput
              key={key}
              checked={permissions[key] !== false}
              onChange={e => onTogglePermission(key, e.target.checked)}
              label={intl.formatMessage(lockLabels[key])}
            />
          ))}
        </section>
      </div>
    </Sidebar>
  );
}

TeacherHudSidebar.propTypes = {
  learnerCount: PropTypes.number.isRequired,
  lectureMode: PropTypes.bool,
  seatLocked: PropTypes.bool,
  permissions: PropTypes.object.isRequired,
  handQueue: PropTypes.arrayOf(
    PropTypes.shape({ id: PropTypes.string, name: PropTypes.string, since: PropTypes.number })
  ).isRequired,
  now: PropTypes.number.isRequired,
  seatCount: PropTypes.number,
  onClose: PropTypes.func,
  onLectureMode: PropTypes.func.isRequired,
  onMuteAll: PropTypes.func.isRequired,
  onGather: PropTypes.func.isRequired,
  onSeatLock: PropTypes.func.isRequired,
  onTogglePermission: PropTypes.func.isRequired
};
