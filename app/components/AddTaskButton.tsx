"use client";

import { useState } from "react";
import { useAsana } from "@/app/components/AsanaProvider";
import AddTaskModal from "@/app/components/AddTaskModal";

export default function AddTaskButton() {
  const [open, setOpen] = useState(false);
  const { refresh } = useAsana();

  return (
    <>
      <button className="btn add-task-btn" onClick={() => setOpen(true)}>
        + Add task
      </button>
      {open && (
        <AddTaskModal onClose={() => setOpen(false)} onAdded={refresh} />
      )}
    </>
  );
}
