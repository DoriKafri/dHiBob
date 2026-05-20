"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-12 h-12 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <span className="text-red-600 text-xl font-bold">!</span>
        </div>
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{error.message || "An unexpected error occurred."}</p>
        <button
          onClick={reset}
          className="px-4 py-2 text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white rounded-md"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
