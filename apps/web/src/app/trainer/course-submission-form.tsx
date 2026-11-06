"use client";

type TrainerCourseSubmissionFormProps = {
  saving: boolean;
  label: string;
  submittingLabel: string;
  onSubmit: () => void;
};

export default function TrainerCourseSubmissionForm({
  saving,
  label,
  submittingLabel,
  onSubmit
}: TrainerCourseSubmissionFormProps) {
  return (
    <form
      className="trainer-submission-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <button className="button trainer-submit-button" type="submit" disabled={saving}>
        {saving ? submittingLabel : label}
      </button>
    </form>
  );
}
