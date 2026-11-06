import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TrainerCourseSubmissionForm from "./course-submission-form";

describe("trainer course submission form", () => {
  it("submits when clicked even before the course is ready", () => {
    const onSubmit = vi.fn();
    render(
      <TrainerCourseSubmissionForm
        saving={false}
        label="Soumettre à l’administration"
        submittingLabel="Envoi…"
        onSubmit={onSubmit}
      />
    );

    const button = screen.getByRole("button", { name: "Soumettre à l’administration" });
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("prevents duplicate submissions while a request is in progress", () => {
    const onSubmit = vi.fn();
    render(
      <TrainerCourseSubmissionForm
        saving
        label="Soumettre à l’administration"
        submittingLabel="Envoi…"
        onSubmit={onSubmit}
      />
    );

    const button = screen.getByRole("button", { name: "Envoi…" });
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
