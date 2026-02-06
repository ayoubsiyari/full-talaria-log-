"use client";

import * as React from "react";
import { useState, useId, useEffect } from "react";
import { Slot } from "@radix-ui/react-slot";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import { Eye, EyeOff } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string) {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password must be at most 128 characters";
  return null;
}

export interface TypewriterProps {
  text: string | string[];
  speed?: number;
  cursor?: string;
  loop?: boolean;
  deleteSpeed?: number;
  delay?: number;
  className?: string;
}

export function Typewriter({
  text,
  speed = 100,
  cursor = "|",
  loop = false,
  deleteSpeed = 50,
  delay = 1500,
  className,
}: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [textArrayIndex, setTextArrayIndex] = useState(0);

  const textArray = Array.isArray(text) ? text : [text];
  const currentText = textArray[textArrayIndex] || "";

  useEffect(() => {
    if (!currentText) return;

    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (currentIndex < currentText.length) {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
          } else if (loop) {
            setTimeout(() => setIsDeleting(true), delay);
          }
        } else {
          if (displayText.length > 0) {
            setDisplayText((prev) => prev.slice(0, -1));
          } else {
            setIsDeleting(false);
            setCurrentIndex(0);
            setTextArrayIndex((prev) => (prev + 1) % textArray.length);
          }
        }
      },
      isDeleting ? deleteSpeed : speed,
    );

    return () => clearTimeout(timeout);
  }, [
    currentIndex,
    isDeleting,
    currentText,
    loop,
    speed,
    deleteSpeed,
    delay,
    displayText,
    text,
  ]);

  return (
    <span className={className}>
      {displayText}
      <span className="animate-pulse">{cursor}</span>
    </span>
  );
}

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input dark:border-input/50 bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary-foreground/60 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-md px-6",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const AuthButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
AuthButton.displayName = "AuthButton";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-input dark:border-input/50 bg-background px-3 py-3 text-sm text-foreground shadow-sm shadow-black/5 transition-shadow placeholder:text-muted-foreground/70 focus-visible:bg-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
}
const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, ...props }, ref) => {
    const id = useId();
    const [showPassword, setShowPassword] = useState(false);
    const togglePasswordVisibility = () => setShowPassword((prev) => !prev);
    return (
      <div className="grid w-full items-center gap-2">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="relative">
          <Input id={id} type={showPassword ? "text" : "password"} className={cn("pe-10", className)} ref={ref} {...props} />
          <button type="button" onClick={togglePasswordVisibility} className="absolute inset-y-0 end-0 flex h-full w-10 items-center justify-center text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50" aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? (<EyeOff className="size-4" aria-hidden="true" />) : (<Eye className="size-4" aria-hidden="true" />)}
          </button>
        </div>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

function SignInForm({ prefillEmail, bannerMessage, nextPath, onForgotPassword }: { prefillEmail?: string; bannerMessage?: string | null; nextPath?: string; onForgotPassword: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      const email = String(data.get("email") || "").trim();
      const password = String(data.get("password") || "");

      if (!isValidEmail(email) || !password) {
        setError("Please enter a valid email and password");
        return;
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body && body.detail) ? String(body.detail) : "Login failed");
        return;
      }

      const safeNext = nextPath && nextPath.startsWith("/") ? nextPath : null;
      window.location.href = safeNext || "/";
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={handleSignIn} autoComplete="on" className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Sign in to your account</h1>
        <p className="text-balance text-sm text-muted-foreground">Enter your email below to sign in</p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" placeholder="m@example.com" required autoComplete="email" defaultValue={prefillEmail || ""} /></div>
        <div className="grid gap-2">
          <PasswordInput name="password" label="Password" required autoComplete="current-password" placeholder="Password" />
          <div className="text-right">
            <AuthButton type="button" variant="link" className="p-0 h-auto text-xs" onClick={onForgotPassword}>Forgot password?</AuthButton>
          </div>
        </div>
        {bannerMessage && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{bannerMessage}</div>}
        {error && <div className="text-sm text-red-500">{error}</div>}
        <AuthButton type="submit" variant="outline" className="mt-2" disabled={loading}>{loading ? "Signing In..." : "Sign In"}</AuthButton>
      </div>
    </form>
  );
}

function ForgotPasswordForm({ onBack, onCodeSent }: { onBack: () => void; onCodeSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!isValidEmail(email.trim())) {
        setError("Please enter a valid email");
        return;
      }

      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body && body.detail) ? String(body.detail) : "Failed to send reset code");
        return;
      }

      onCodeSent(email.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Forgot password?</h1>
        <p className="text-balance text-sm text-muted-foreground">Enter your email and we'll send you a reset code</p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="m@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error && <div className="text-sm text-red-500">{error}</div>}
        <AuthButton type="submit" variant="outline" className="mt-2" disabled={loading || !email.trim()}>
          {loading ? "Sending..." : "Send Reset Code"}
        </AuthButton>
        <AuthButton type="button" variant="link" onClick={onBack} className="p-0 h-auto">
          ← Back to sign in
        </AuthButton>
      </div>
    </form>
  );
}

function ResetPasswordForm({ email, onBack, onSuccess }: { email: string; onBack: () => void; onSuccess: () => void }) {
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (code.length !== 6) {
        setError("Please enter a 6-digit code");
        return;
      }

      const passwordErr = validatePassword(newPassword);
      if (passwordErr) {
        setError(passwordErr);
        return;
      }

      if (newPassword !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }

      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, new_password: newPassword }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body && body.detail) ? String(body.detail) : "Failed to reset password");
        return;
      }

      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setResendSuccess(false);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body && body.detail) ? String(body.detail) : "Failed to resend code");
        return;
      }

      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Reset password</h1>
        <p className="text-balance text-sm text-muted-foreground">
          Enter the code sent to <strong>{email}</strong>
        </p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="code">Reset Code</Label>
          <Input
            id="code"
            name="code"
            type="text"
            placeholder="123456"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-2xl tracking-widest"
          />
        </div>
        <div className="grid gap-2">
          <PasswordInput name="newPassword" label="New Password" required placeholder="New password" value={newPassword} onChange={(e) => setNewPassword((e.target as HTMLInputElement).value)} />
          <div className="text-xs text-muted-foreground">Minimum 8 characters</div>
        </div>
        <div className="grid gap-2">
          <PasswordInput name="confirmPassword" label="Confirm Password" required placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword((e.target as HTMLInputElement).value)} />
        </div>
        {error && <div className="text-sm text-red-500">{error}</div>}
        {resendSuccess && <div className="text-sm text-green-500">Code sent successfully!</div>}
        <AuthButton type="submit" variant="outline" className="mt-2" disabled={loading || code.length !== 6}>
          {loading ? "Resetting..." : "Reset Password"}
        </AuthButton>
        <div className="flex justify-between text-sm">
          <AuthButton type="button" variant="link" onClick={onBack} className="p-0 h-auto">
            ← Back
          </AuthButton>
          <AuthButton type="button" variant="link" onClick={handleResend} disabled={resending} className="p-0 h-auto">
            {resending ? "Sending..." : "Resend code"}
          </AuthButton>
        </div>
      </div>
    </form>
  );
}

function VerificationForm({ email, onVerified, onBack, nextPath }: { email: string; onVerified: () => void; onBack: () => void; nextPath?: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code: code.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body && body.detail) ? String(body.detail) : "Verification failed");
        return;
      }

      const safeNext = nextPath && nextPath.startsWith("/") ? nextPath : null;
      window.location.href = safeNext || "/";
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    setResendSuccess(false);

    try {
      const res = await fetch("/api/auth/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError((body && body.detail) ? String(body.detail) : "Failed to resend code");
        return;
      }

      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={handleVerify} className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Verify your email</h1>
        <p className="text-balance text-sm text-muted-foreground">
          We sent a 6-digit code to <strong>{email}</strong>
        </p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="code">Verification Code</Label>
          <Input
            id="code"
            name="code"
            type="text"
            placeholder="123456"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-2xl tracking-widest"
          />
        </div>
        {error && <div className="text-sm text-red-500">{error}</div>}
        {resendSuccess && <div className="text-sm text-green-500">Code sent successfully!</div>}
        <AuthButton type="submit" variant="outline" className="mt-2" disabled={loading || code.length !== 6}>
          {loading ? "Verifying..." : "Verify Email"}
        </AuthButton>
        <div className="flex justify-between text-sm">
          <AuthButton type="button" variant="link" onClick={onBack} className="p-0 h-auto">
            ← Back
          </AuthButton>
          <AuthButton type="button" variant="link" onClick={handleResend} disabled={resending} className="p-0 h-auto">
            {resending ? "Sending..." : "Resend code"}
          </AuthButton>
        </div>
      </div>
    </form>
  );
}

function SignUpForm({ onSignedUp, onNeedsVerification, nextPath }: { onSignedUp: (email: string) => void; onNeedsVerification: (email: string) => void; nextPath?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string; confirmPassword?: string }>({});

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);

    try {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      const passwordErr = validatePassword(password);
      const nextErrors: { name?: string; email?: string; password?: string; confirmPassword?: string } = {};

      if (!trimmedName) nextErrors.name = "Name is required";
      if (!trimmedEmail || !isValidEmail(trimmedEmail)) nextErrors.email = "Please enter a valid email";
      if (passwordErr) nextErrors.password = passwordErr;
      if (!confirmPassword) nextErrors.confirmPassword = "Please confirm your password";
      if (password && confirmPassword && password !== confirmPassword) nextErrors.confirmPassword = "Passwords do not match";

      if (Object.keys(nextErrors).length > 0) {
        setFieldErrors(nextErrors);
        return;
      }

      const signupRes = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmedName, email: trimmedEmail, password }),
      });

      const body = await signupRes.json().catch(() => null);

      if (!signupRes.ok) {
        setError((body && body.detail) ? String(body.detail) : "Sign up failed");
        return;
      }

      // Check if verification is required
      if (body && body.requires_verification) {
        onNeedsVerification(trimmedEmail);
      } else {
        onSignedUp(trimmedEmail);
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <form onSubmit={handleSignUp} autoComplete="on" className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="text-balance text-sm text-muted-foreground">Enter your details below to sign up</p>
      </div>
      <div className="grid gap-4">
        <div className="grid gap-1">
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" name="name" type="text" placeholder="John Doe" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          {fieldErrors.name && <div className="text-xs text-red-500">{fieldErrors.name}</div>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" placeholder="m@example.com" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {fieldErrors.email && <div className="text-xs text-red-500">{fieldErrors.email}</div>}
        </div>
        <div className="grid gap-2">
          <PasswordInput name="password" label="Password" required autoComplete="new-password" placeholder="Password" value={password} onChange={(e) => setPassword((e.target as HTMLInputElement).value)} />
          <div className="text-xs text-muted-foreground">Minimum 8 characters</div>
          {fieldErrors.password && <div className="text-xs text-red-500">{fieldErrors.password}</div>}
        </div>
        <div className="grid gap-2">
          <PasswordInput name="confirmPassword" label="Confirm Password" required autoComplete="new-password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword((e.target as HTMLInputElement).value)} />
          {fieldErrors.confirmPassword && <div className="text-xs text-red-500">{fieldErrors.confirmPassword}</div>}
        </div>
        {error && <div className="text-sm text-red-500">{error}</div>}
        <AuthButton type="submit" variant="outline" className="mt-2" disabled={loading}>{loading ? "Creating..." : "Sign Up"}</AuthButton>
      </div>
    </form>
  );
}

function AuthFormContainer({ isSignIn, onToggle, onSignedUp, onNeedsVerification, verificationEmail, onBackFromVerification, prefillEmail, bannerMessage, nextPath, forgotPasswordMode, resetPasswordEmail, onForgotPassword, onBackFromForgot, onResetCodeSent, onPasswordReset }: { isSignIn: boolean; onToggle: () => void; onSignedUp: (email: string) => void; onNeedsVerification: (email: string) => void; verificationEmail: string | null; onBackFromVerification: () => void; prefillEmail?: string; bannerMessage?: string | null; nextPath?: string; forgotPasswordMode: boolean; resetPasswordEmail: string | null; onForgotPassword: () => void; onBackFromForgot: () => void; onResetCodeSent: (email: string) => void; onPasswordReset: () => void }) {
    const showExtraOptions = !verificationEmail && !forgotPasswordMode && !resetPasswordEmail;
    
    return (
        <div className="mx-auto grid w-[350px] gap-4">
            <div className="flex flex-col items-center gap-2 mb-4">
                <img src="/logo-08.png" alt="Talaria Log" className="h-20 w-20" />
                <span className="text-xl font-bold text-foreground">Talaria Log</span>
            </div>
            {resetPasswordEmail ? (
              <ResetPasswordForm 
                email={resetPasswordEmail} 
                onBack={onBackFromForgot} 
                onSuccess={onPasswordReset} 
              />
            ) : forgotPasswordMode ? (
              <ForgotPasswordForm 
                onBack={onBackFromForgot} 
                onCodeSent={onResetCodeSent} 
              />
            ) : verificationEmail ? (
              <VerificationForm 
                email={verificationEmail} 
                onVerified={() => {}} 
                onBack={onBackFromVerification} 
                nextPath={nextPath} 
              />
            ) : isSignIn ? (
              <SignInForm prefillEmail={prefillEmail} bannerMessage={bannerMessage} nextPath={nextPath} onForgotPassword={onForgotPassword} />
            ) : (
              <SignUpForm onSignedUp={onSignedUp} onNeedsVerification={onNeedsVerification} nextPath={nextPath} />
            )}
            {showExtraOptions && (
              <>
                <div className="text-center text-sm">
                    {isSignIn ? "Don't have an account?" : "Already have an account?"}{" "}
                    <AuthButton variant="link" className="pl-1 text-foreground" onClick={onToggle}>
                        {isSignIn ? "Sign up" : "Sign in"}
                    </AuthButton>
                </div>
                <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                    <span className="relative z-10 bg-background px-2 text-muted-foreground">2025 Mentorship</span>
                </div>
                <a href="/journal/login" className="inline-block w-full">
                    <AuthButton variant="outline" type="button" className="w-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>
                        </svg>
                        2025 Mentorship Login
                    </AuthButton>
                </a>
              </>
            )}
        </div>
    )
}

interface AuthContentProps {
    image?: {
        src: string;
        alt: string;
    };
    quote?: {
        text: string;
        author: string;
    }
}

interface AuthUIProps {
    signInContent?: AuthContentProps;
    signUpContent?: AuthContentProps;
    initialMode?: "signin" | "signup";
    nextPath?: string;
}

const defaultSignInContent = {
    image: {
        src: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&q=80",
        alt: "Trading charts and analytics"
    },
    quote: {
        text: "Welcome Back! The journey continues.",
        author: "Talaria Log"
    }
};

const defaultSignUpContent = {
    image: {
        src: "https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=800&q=80",
        alt: "Financial growth and trading"
    },
    quote: {
        text: "Create an account. A new chapter awaits.",
        author: "Talaria Log"
    }
};

export function AuthUI({ signInContent = {}, signUpContent = {}, initialMode = "signin", nextPath }: AuthUIProps) {
  const [isSignIn, setIsSignIn] = useState(initialMode !== "signup");
  const [prefillEmail, setPrefillEmail] = useState<string>("");
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [resetPasswordEmail, setResetPasswordEmail] = useState<string | null>(null);
  const toggleForm = () => setIsSignIn((prev) => !prev);

  const finalSignInContent = {
      image: { ...defaultSignInContent.image, ...signInContent.image },
      quote: { ...defaultSignInContent.quote, ...signInContent.quote },
  };
  const finalSignUpContent = {
      image: { ...defaultSignUpContent.image, ...signUpContent.image },
      quote: { ...defaultSignUpContent.quote, ...signUpContent.quote },
  };

  const currentContent = isSignIn ? finalSignInContent : finalSignUpContent;

  return (
    <div dir="ltr" className="w-full min-h-screen md:grid md:grid-cols-2">
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }
      `}</style>
      <div className="flex h-screen items-center justify-center p-6 md:h-auto md:p-0 md:py-12">
        <AuthFormContainer
          isSignIn={isSignIn}
          onToggle={toggleForm}
          prefillEmail={prefillEmail}
          bannerMessage={bannerMessage}
          nextPath={nextPath}
          verificationEmail={verificationEmail}
          onBackFromVerification={() => setVerificationEmail(null)}
          onNeedsVerification={(email) => setVerificationEmail(email)}
          forgotPasswordMode={forgotPasswordMode}
          resetPasswordEmail={resetPasswordEmail}
          onForgotPassword={() => setForgotPasswordMode(true)}
          onBackFromForgot={() => {
            setForgotPasswordMode(false);
            setResetPasswordEmail(null);
          }}
          onResetCodeSent={(email) => setResetPasswordEmail(email)}
          onPasswordReset={() => {
            setForgotPasswordMode(false);
            setResetPasswordEmail(null);
            setBannerMessage("Password reset successfully. Please sign in.");
          }}
          onSignedUp={(email) => {
            setPrefillEmail(email);
            setBannerMessage("Account created successfully. Please sign in.");
            setIsSignIn(true);
          }}
        />
      </div>

      <div
        className="hidden md:block relative bg-cover bg-center transition-all duration-500 ease-in-out"
        style={{ backgroundImage: `url(${currentContent.image.src})` }}
        key={currentContent.image.src}
      >

        <div className="absolute inset-x-0 bottom-0 h-[100px] bg-gradient-to-t from-background to-transparent" />
        
        <div className="relative z-10 flex h-full flex-col items-center justify-end p-2 pb-6">
            <blockquote className="space-y-2 text-center text-foreground">
              <p className="text-lg font-medium">
                &ldquo;<Typewriter
                    key={currentContent.quote.text}
                    text={currentContent.quote.text}
                    speed={60}
                  />&rdquo;
              </p>
              <cite className="block text-sm font-light text-muted-foreground not-italic">
                  — {currentContent.quote.author}
              </cite>
            </blockquote>
        </div>
      </div>
    </div>
  );
}
