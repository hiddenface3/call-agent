import React, { useState } from 'react';
import {
  Building2,
  User,
  MapPin,
  Flame,
  Clock,
  DollarSign,
  Wrench,
  HelpCircle,
  Copy,
  Check,
  TrendingUp,
  Download,
  Table as TableIcon,
  LayoutGrid,
  Calendar,
  Sparkles,
  Home,
} from 'lucide-react';
import { QualifiedLead } from '../shared/types';
import { LeadExtractor } from '../services/leadExtractor';

interface LeadCardProps {
  lead: QualifiedLead;
}

export const LeadCard: React.FC<LeadCardProps> = ({ lead }) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  const getStatusColor = (status: QualifiedLead['dealStatus']) => {
    switch (status) {
      case 'Hot Lead':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      case 'Warm Follow-Up':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'Nurture':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  const handleDownloadCsv = () => {
    LeadExtractor.downloadLeadCsv(lead);
  };

  const handleCopyLead = () => {
    const text = `
REAL ESTATE QUALIFIED CLIENT CRM DATA:
======================================
Client / Seller Name: ${lead.sellerName || 'Pending'}
Phone Number: ${lead.phone || '(555) 382-9104'}
Property Details: ${lead.propertyDetails || 'Pending'}
Property Address: ${lead.propertyAddress || 'Pending'}
Property Type: ${lead.propertyType}
Condition & Repairs: ${lead.condition}
Asking Price: ${lead.askingPrice || 'Pending'}
Scheduled Callback: ${lead.callbackTime || 'Pending'}
Selling Timeline: ${lead.timeline}
Seller Motivation: ${lead.reasonForSelling || 'Pending'}
Qualification Score: ${lead.qualificationScore}%
Deal Status: ${lead.dealStatus}
${
  lead.customFields && Object.keys(lead.customFields).length > 0
    ? `Custom Variables:\n${Object.entries(lead.customFields)
        .map(([k, v]) => ` - {{${k}}}: ${v}`)
        .join('\n')}`
    : ''
}
    `.trim();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tableRows = [
    {
      tag: 'client_name',
      label: 'Client Name',
      value: lead.sellerName,
      placeholder: 'Listening for caller name...',
      icon: <User className="w-3.5 h-3.5 text-blue-400" />,
      color: 'text-blue-300',
    },
    {
      tag: 'property_details',
      label: 'Property Details',
      value: lead.propertyDetails,
      placeholder: 'e.g. 2 bed 2 bath house...',
      icon: <Home className="w-3.5 h-3.5 text-emerald-400" />,
      color: 'text-emerald-300 font-semibold',
    },
    {
      tag: 'callback_time',
      label: 'Callback Time',
      value: lead.callbackTime,
      placeholder: 'e.g. Tomorrow at 2:00 PM',
      icon: <Calendar className="w-3.5 h-3.5 text-cyan-400" />,
      color: 'text-cyan-300 font-semibold',
    },
    {
      tag: 'asking_price',
      label: 'Asking Price',
      value: lead.askingPrice,
      placeholder: 'Pending discussion...',
      icon: <DollarSign className="w-3.5 h-3.5 text-emerald-400" />,
      color: 'text-emerald-400 font-mono font-bold',
    },
    {
      tag: 'property_address',
      label: 'Property Address',
      value: lead.propertyAddress,
      placeholder: 'Listening for address...',
      icon: <MapPin className="w-3.5 h-3.5 text-purple-400" />,
      color: 'text-purple-300',
    },
    {
      tag: 'condition',
      label: 'Repairs & Condition',
      value: lead.condition !== 'Unknown' ? lead.condition : '',
      placeholder: 'Repairs / TLC status...',
      icon: <Wrench className="w-3.5 h-3.5 text-amber-400" />,
      color: 'text-amber-300',
    },
    {
      tag: 'timeline',
      label: 'Selling Timeline',
      value: lead.timeline !== 'Unknown' ? lead.timeline : '',
      placeholder: 'Immediate / 1-3 Months...',
      icon: <Clock className="w-3.5 h-3.5 text-teal-400" />,
      color: 'text-teal-300',
    },
    {
      tag: 'reason_for_selling',
      label: 'Seller Motivation',
      value: lead.reasonForSelling,
      placeholder: 'Reason for selling...',
      icon: <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />,
      color: 'text-indigo-300',
    },
  ];

  return (
    <div className="rounded-2xl glass-panel p-4 border border-slate-800 shadow-xl flex flex-col justify-between h-full overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Card Header */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between pb-3 mb-2.5 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white tracking-tight">Lead CRM Data Table</h3>
              <p className="text-[10px] text-slate-400">Live AI slot extraction</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="bg-slate-900 border border-slate-800 p-0.5 rounded-lg flex items-center">
              <button
                onClick={() => setViewMode('table')}
                className={`p-1 rounded text-xs transition ${
                  viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Table Form View"
              >
                <TableIcon className="w-3 h-3" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1 rounded text-xs transition ${
                  viewMode === 'cards' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Cards View"
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
            </div>

            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1 ${getStatusColor(
                lead.dealStatus
              )}`}
            >
              <Flame className="w-2.5 h-2.5" />
              {lead.dealStatus}
            </span>
          </div>
        </div>

        {/* Qualification Score Bar */}
        <div className="mb-2.5 bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl shrink-0">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-slate-400 flex items-center gap-1">
              <TrendingUp className="w-3 h-3 text-blue-400" />
              Extraction Completeness
            </span>
            <span className="font-bold text-white font-mono">{lead.qualificationScore}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-700 rounded-full ${
                lead.qualificationScore >= 70
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  : lead.qualificationScore >= 40
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                  : 'bg-gradient-to-r from-blue-500 to-cyan-400'
              }`}
              style={{ width: `${Math.max(8, lead.qualificationScore)}%` }}
            ></div>
          </div>
        </div>

        {/* Main Content Area (Table vs Cards) */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-2 text-xs">
          {viewMode === 'table' ? (
            /* Structured CRM Table Form */
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-inner">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 border-b border-slate-700/80 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-2 px-2.5">Field / Variable</th>
                    <th className="py-2 px-2.5">Extracted Data</th>
                    <th className="py-2 px-1.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {tableRows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-800/40 transition">
                      <td className="py-2 px-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          {row.icon}
                          <span className="font-medium text-slate-300">{row.label}</span>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500 block mt-0.5">{row.tag}</span>
                      </td>
                      <td className="py-2 px-2.5 align-middle">
                        {row.value ? (
                          <span className={`${row.color} select-text`}>{row.value}</span>
                        ) : (
                          <span className="text-slate-600 italic text-[10px]">{row.placeholder}</span>
                        )}
                      </td>
                      <td className="py-2 px-1.5 align-middle text-right">
                        {row.value ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Captured
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-800 text-slate-500">
                            Waiting
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Dynamic Custom Fields */}
                  {lead.customFields &&
                    Object.entries(lead.customFields).map(([customKey, customVal], cIdx) => (
                      <tr key={`custom-${cIdx}`} className="hover:bg-slate-800/40 transition bg-indigo-950/20">
                        <td className="py-2 px-2.5 align-top">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                            <span className="font-medium text-indigo-300 capitalize">{customKey.replace(/_/g, ' ')}</span>
                          </div>
                          <span className="text-[9px] font-mono text-indigo-400/80 block mt-0.5">{customKey}</span>
                        </td>
                        <td className="py-2 px-2.5 align-middle">
                          <span className="text-indigo-200 font-medium select-text">{customVal}</span>
                        </td>
                        <td className="py-2 px-1.5 align-middle text-right">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            Custom
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Cards View */
            <div className="space-y-2">
              {tableRows.map((row, rIdx) => (
                <div key={rIdx} className="flex items-start gap-2.5 p-2 rounded-xl bg-slate-900/50 border border-slate-800/80">
                  <div className="mt-0.5 shrink-0">{row.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
                        {row.label}
                      </span>
                      <span className="text-[9px] font-mono text-slate-600">{row.tag}</span>
                    </div>
                    <div className="text-xs truncate select-text mt-0.5">
                      {row.value ? (
                        <span className={row.color}>{row.value}</span>
                      ) : (
                        <span className="text-slate-600 italic text-[11px]">{row.placeholder}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Footer: 1-Click Download CSV & Copy */}
      <div className="pt-3 mt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 shrink-0">
        <button
          onClick={handleDownloadCsv}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition active:scale-98"
          title="Download lead data as CSV spreadsheet"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download CSV</span>
        </button>

        <button
          onClick={handleCopyLead}
          className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition active:scale-98"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Data</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
