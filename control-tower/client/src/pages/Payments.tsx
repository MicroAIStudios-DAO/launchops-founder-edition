/**
 * Payments — Stripe Revenue Dashboard
 * AscertAI brand tokens: Outfit font, OKLCH cyan/violet, frosted glass panels
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CreditCard,
  TrendingUp,
  Users,
  DollarSign,
  ExternalLink,
  Plus,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Clock,
  AlertCircle,
  Link as LinkIcon,
} from "lucide-react";
import { toast } from "sonner";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  const map: Record<string, { color: string; icon: React.ReactNode }> = {
    succeeded: { color: "text-[oklch(75%_.15_145)]", icon: <CheckCircle2 className="w-3 h-3" /> },
    active: { color: "text-[oklch(75%_.15_145)]", icon: <CheckCircle2 className="w-3 h-3" /> },
    trialing: { color: "text-[oklch(75%_.15_195)]", icon: <Clock className="w-3 h-3" /> },
    pending: { color: "text-[oklch(75%_.15_60)]", icon: <Clock className="w-3 h-3" /> },
    failed: { color: "text-[oklch(65%_.22_25)]", icon: <XCircle className="w-3 h-3" /> },
    canceled: { color: "text-[oklch(60%_.05_0)]", icon: <XCircle className="w-3 h-3" /> },
    cancel_at_period_end: { color: "text-[oklch(75%_.15_60)]", icon: <AlertCircle className="w-3 h-3" /> },
  };
  const s = map[status] ?? { color: "text-muted-foreground", icon: null };
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${s.color}`}>
      {s.icon}
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({
  title,
  value,
  sub,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card className="bg-[oklch(18%_.03_240/0.7)] border-[oklch(75%_.15_195/0.15)] backdrop-blur-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{title}</p>
            {loading ? (
              <Skeleton className="h-7 w-28 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-[oklch(75%_.15_195)] font-[Outfit]">{value}</p>
            )}
            {sub && !loading && (
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            )}
          </div>
          <div className="p-2 rounded-lg bg-[oklch(75%_.15_195/0.1)]">
            <Icon className="w-5 h-5 text-[oklch(75%_.15_195)]" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Create Payment Link dialog ────────────────────────────────────────────────
function CreateLinkDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"payment" | "subscription">("payment");
  const [interval, setInterval] = useState<"month" | "year">("month");

  const createLink = trpc.stripe.createPaymentLink.useMutation({
    onSuccess: (data) => {
      toast.success("Payment link created!", {
        description: data.url,
        action: { label: "Open", onClick: () => window.open(data.url, "_blank") },
      });
      setOpen(false);
      setName("");
      setAmount("");
      onCreated();
    },
    onError: (err) => toast.error("Failed to create link", { description: err.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="bg-[oklch(65%_.20_290)] hover:bg-[oklch(60%_.22_290)] text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          New Payment Link
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[oklch(14%_.03_240)] border-[oklch(75%_.15_195/0.2)] text-foreground">
        <DialogHeader>
          <DialogTitle className="font-[Outfit] text-[oklch(75%_.15_195)]">
            Create Payment Link
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1">
            <Label>Product Name</Label>
            <Input
              placeholder="e.g. LaunchOps Pro Monthly"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-[oklch(18%_.03_240)] border-[oklch(75%_.15_195/0.2)]"
            />
          </div>
          <div className="space-y-1">
            <Label>Amount (USD)</Label>
            <Input
              type="number"
              placeholder="49.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-[oklch(18%_.03_240)] border-[oklch(75%_.15_195/0.2)]"
            />
          </div>
          <div className="space-y-1">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "payment" | "subscription")}>
              <SelectTrigger className="bg-[oklch(18%_.03_240)] border-[oklch(75%_.15_195/0.2)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="payment">One-time Payment</SelectItem>
                <SelectItem value="subscription">Subscription</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "subscription" && (
            <div className="space-y-1">
              <Label>Billing Interval</Label>
              <Select value={interval} onValueChange={(v) => setInterval(v as "month" | "year")}>
                <SelectTrigger className="bg-[oklch(18%_.03_240)] border-[oklch(75%_.15_195/0.2)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Button
            className="w-full bg-[oklch(75%_.15_195)] hover:bg-[oklch(70%_.18_195)] text-black font-semibold"
            disabled={createLink.isPending || !name || !amount}
            onClick={() =>
              createLink.mutate({
                name,
                amount: parseFloat(amount),
                mode,
                interval: mode === "subscription" ? interval : undefined,
              })
            }
          >
            {createLink.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <LinkIcon className="w-4 h-4 mr-2" />
            )}
            Generate Link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Payments() {
  const [subFilter, setSubFilter] = useState("all");

  const dashboard = trpc.stripe.getDashboard.useQuery(undefined, { refetchInterval: 60_000 });
  const subscriptions = trpc.stripe.listSubscriptions.useQuery(
    { status: subFilter === "all" ? undefined : subFilter },
    { refetchInterval: 60_000 }
  );
  const paymentLinks = trpc.stripe.listPaymentLinks.useQuery(undefined, { refetchInterval: 120_000 });

  const cancelSub = trpc.stripe.cancelSubscription.useMutation({
    onSuccess: () => {
      toast.success("Subscription marked for cancellation at period end.");
      subscriptions.refetch();
    },
    onError: (err) => toast.error("Cancel failed", { description: err.message }),
  });

  const d = dashboard.data;

  return (
    <div className="p-6 space-y-6 font-[Outfit]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[oklch(75%_.15_195)] flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            Payments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Stripe revenue, subscriptions &amp; payment links
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-[oklch(75%_.15_195/0.3)] gap-2"
            onClick={() => { dashboard.refetch(); subscriptions.refetch(); paymentLinks.refetch(); }}
          >
            <RefreshCw className={`w-4 h-4 ${dashboard.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-[oklch(75%_.15_195/0.3)] gap-2"
            onClick={() => window.open("https://dashboard.stripe.com", "_blank")}
          >
            <ExternalLink className="w-4 h-4" />
            Stripe Dashboard
          </Button>
          <CreateLinkDialog onCreated={() => paymentLinks.refetch()} />
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Available Balance"
          value={d ? fmt(d.balance.available, d.balance.currency) : "—"}
          sub={d ? `${fmt(d.balance.pending, d.balance.currency)} pending` : undefined}
          icon={DollarSign}
          loading={dashboard.isLoading}
        />
        <MetricCard
          title="MRR"
          value={d ? fmt(d.mrr) : "—"}
          sub="Monthly recurring revenue"
          icon={TrendingUp}
          loading={dashboard.isLoading}
        />
        <MetricCard
          title="Active Subscriptions"
          value={d ? String(d.activeSubscriptions) : "—"}
          sub="Active + trialing"
          icon={Users}
          loading={dashboard.isLoading}
        />
        <MetricCard
          title="Recent Charges"
          value={d ? String(d.recentCharges.length) : "—"}
          sub="Last 10 transactions"
          icon={CreditCard}
          loading={dashboard.isLoading}
        />
      </div>

      {/* Recent charges */}
      <Card className="bg-[oklch(18%_.03_240/0.7)] border-[oklch(75%_.15_195/0.15)] backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-[oklch(75%_.15_195)]">
            Recent Charges
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !d?.recentCharges.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No charges yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-[oklch(75%_.15_195/0.1)]">
                  <TableHead className="text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Description</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.recentCharges.map((c) => (
                  <TableRow key={c.id} className="border-[oklch(75%_.15_195/0.08)] hover:bg-[oklch(75%_.15_195/0.04)]">
                    <TableCell className="font-mono font-medium">
                      {fmt(c.amount, c.currency)}
                    </TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {c.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(c.createdAt)}
                    </TableCell>
                    <TableCell>
                      {c.receiptUrl ? (
                        <a
                          href={c.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[oklch(75%_.15_195)] hover:underline text-xs flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Subscriptions */}
      <Card className="bg-[oklch(18%_.03_240/0.7)] border-[oklch(75%_.15_195/0.15)] backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-[oklch(75%_.15_195)]">
              Subscriptions
            </CardTitle>
            <Select value={subFilter} onValueChange={setSubFilter}>
              <SelectTrigger className="w-36 h-8 text-xs bg-[oklch(14%_.03_240)] border-[oklch(75%_.15_195/0.2)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="past_due">Past due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {subscriptions.isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !subscriptions.data?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No subscriptions found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-[oklch(75%_.15_195/0.1)]">
                  <TableHead className="text-muted-foreground">ID</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Plan</TableHead>
                  <TableHead className="text-muted-foreground">Period End</TableHead>
                  <TableHead className="text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.data.map((s) => (
                  <TableRow key={s.id} className="border-[oklch(75%_.15_195/0.08)] hover:bg-[oklch(75%_.15_195/0.04)]">
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.id}</TableCell>
                    <TableCell>{statusBadge(s.status)}</TableCell>
                    <TableCell className="text-sm">
                      {s.items.map((item) => (
                        <span key={item.id} className="text-muted-foreground">
                          {fmt(item.amount, item.currency)}/{item.interval}
                        </span>
                      ))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(s.currentPeriodEnd)}
                      {s.cancelAtPeriodEnd && (
                        <Badge variant="outline" className="ml-2 text-[oklch(75%_.15_60)] border-[oklch(75%_.15_60/0.3)] text-[10px]">
                          cancels
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {(s.status === "active" || s.status === "trialing") && !s.cancelAtPeriodEnd && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[oklch(65%_.22_25)] hover:text-[oklch(65%_.22_25)] hover:bg-[oklch(65%_.22_25/0.1)] h-7 text-xs"
                          disabled={cancelSub.isPending}
                          onClick={() => cancelSub.mutate({ subscriptionId: s.id })}
                        >
                          Cancel
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment Links */}
      <Card className="bg-[oklch(18%_.03_240/0.7)] border-[oklch(75%_.15_195/0.15)] backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-[oklch(75%_.15_195)]">
            Payment Links
          </CardTitle>
        </CardHeader>
        <CardContent>
          {paymentLinks.isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !paymentLinks.data?.length ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-3">No payment links yet.</p>
              <CreateLinkDialog onCreated={() => paymentLinks.refetch()} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-[oklch(75%_.15_195/0.1)]">
                  <TableHead className="text-muted-foreground">Link ID</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">URL</TableHead>
                  <TableHead className="text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentLinks.data.map((l) => (
                  <TableRow key={l.id} className="border-[oklch(75%_.15_195/0.08)] hover:bg-[oklch(75%_.15_195/0.04)]">
                    <TableCell className="font-mono text-xs text-muted-foreground">{l.id}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={l.active
                          ? "text-[oklch(75%_.15_145)] border-[oklch(75%_.15_145/0.3)]"
                          : "text-muted-foreground border-muted"
                        }
                      >
                        {l.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[oklch(75%_.15_195)] hover:underline text-xs"
                      >
                        {l.url}
                      </a>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(l.url);
                            toast.success("Link copied to clipboard");
                          }}
                        >
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => window.open(l.url, "_blank")}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
