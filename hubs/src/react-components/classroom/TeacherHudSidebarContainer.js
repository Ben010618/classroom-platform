import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { TeacherHudSidebar } from "./TeacherHudSidebar";
import { useRoomPermissions } from "../room/hooks/useRoomPermissions";
import { learnerIds } from "../../classroom/protocol";
import {
  getHandQueue,
  subscribeHandQueue,
  gatherAll,
  sendSeatLock,
  muteAllLearners,
  setMemberPermissions,
  setLectureMode,
  isLectureMode,
  sceneSeatNames
} from "../../classroom/runtime";

function useHandQueue() {
  const [queue, setQueue] = useState(getHandQueue);
  useEffect(() => subscribeHandQueue(setQueue), []);
  return queue;
}

function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function TeacherHudSidebarContainer({ presences, onClose }) {
  const permissions = useRoomPermissions();
  const handQueue = useHandQueue();
  const now = useNow();
  // Seat lock is a learner-side state, so the teacher's toggle tracks what was last sent.
  const [seatLocked, setSeatLocked] = useState(false);
  const learnerCount = useMemo(() => learnerIds(presences).length, [presences]);
  const seatCount = useMemo(() => sceneSeatNames().length, []);
  const lectureMode = isLectureMode(permissions);

  return (
    <TeacherHudSidebar
      learnerCount={learnerCount}
      seatCount={seatCount}
      lectureMode={lectureMode}
      seatLocked={seatLocked}
      permissions={permissions}
      handQueue={handQueue}
      now={now}
      onClose={onClose}
      onLectureMode={on => {
        setLectureMode(on);
        setSeatLocked(on);
      }}
      onMuteAll={muteAllLearners}
      onGather={gatherAll}
      onSeatLock={on => {
        sendSeatLock(on);
        setSeatLocked(on);
      }}
      onTogglePermission={(key, allowed) => setMemberPermissions({ [key]: allowed })}
    />
  );
}

TeacherHudSidebarContainer.propTypes = {
  presences: PropTypes.object.isRequired,
  onClose: PropTypes.func
};
