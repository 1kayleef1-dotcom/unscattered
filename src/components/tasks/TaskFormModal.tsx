import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input, Label, Select } from "../ui/Field";
import {
  CATEGORIES,
  ESTIMATED_TIME_LABELS,
  URGENCY_ORDER,
  URGENCY_LABELS,
  type Category,
  type EstimatedTime,
  type Task,
  type Urgency,
} from "../../types";

export interface TaskFormValues {
  title: string;
  category: Category;
  urgency: Urgency;
  dueDate?: string;
  estimatedTime?: EstimatedTime;
}

export function TaskFormModal({
  open,
  onClose,
  onSave,
  initialTask,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (values: TaskFormValues) => void;
  initialTask?: Task;
}) {
  const [values, setValues] = useState<TaskFormValues>({
    title: "",
    category: "Other",
    urgency: "week",
    dueDate: undefined,
    estimatedTime: undefined,
  });

  useEffect(() => {
    if (open) {
      setValues(
        initialTask
          ? {
              title: initialTask.title,
              category: initialTask.category,
              urgency: initialTask.urgency,
              dueDate: initialTask.dueDate,
              estimatedTime: initialTask.estimatedTime,
            }
          : { title: "", category: "Other", urgency: "week", dueDate: undefined, estimatedTime: undefined },
      );
    }
  }, [open, initialTask]);

  const handleSubmit = () => {
    if (!values.title.trim()) return;
    onSave({ ...values, title: values.title.trim() });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialTask ? "Edit task" : "Add a task"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!values.title.trim()}>
            {initialTask ? "Save changes" : "Add task"}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div>
          <Label htmlFor="task-title">What needs doing?</Label>
          <Input
            id="task-title"
            autoFocus
            value={values.title}
            onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            placeholder="e.g. Call the vet about Milo's checkup"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="task-category">Category</Label>
            <Select
              id="task-category"
              value={values.category}
              onChange={(e) => setValues((v) => ({ ...v, category: e.target.value as Category }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="task-urgency">Urgency</Label>
            <Select
              id="task-urgency"
              value={values.urgency}
              onChange={(e) => setValues((v) => ({ ...v, urgency: e.target.value as Urgency }))}
            >
              {URGENCY_ORDER.map((u) => (
                <option key={u} value={u}>
                  {URGENCY_LABELS[u]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="task-due">Due date (optional)</Label>
            <Input
              id="task-due"
              type="date"
              value={values.dueDate ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, dueDate: e.target.value || undefined }))}
            />
          </div>
          <div>
            <Label htmlFor="task-estimate">Estimated time</Label>
            <Select
              id="task-estimate"
              value={values.estimatedTime ?? ""}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  estimatedTime: (e.target.value || undefined) as EstimatedTime | undefined,
                }))
              }
            >
              <option value="">No estimate</option>
              {Object.entries(ESTIMATED_TIME_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </form>
    </Modal>
  );
}
