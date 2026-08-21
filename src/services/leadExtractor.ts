import { ChatMessage, QualifiedLead, FlowNode } from '../shared/types';

export class LeadExtractor {
  /**
   * Parse full conversation transcript and extract updated lead parameters in real-time
   */
  static extractLeadInfo(
    messages: ChatMessage[],
    currentLead: QualifiedLead,
    nodes?: FlowNode[]
  ): QualifiedLead {
    const updated: QualifiedLead = {
      ...currentLead,
      customFields: { ...(currentLead.customFields || {}) },
    };

    const userTexts = messages.filter((m) => m.sender === 'user').map((m) => m.text);
    const fullUserDialogue = userTexts.join(' ');
    const lowerAll = fullUserDialogue.toLowerCase();

    // 1. Extract Seller / Client Name (from greetings or explicit name statements)
    if (!updated.sellerName || updated.sellerName.includes('Pending')) {
      for (const text of userTexts) {
        const nameMatch = text.match(/(?:my name is|i am|i'm|this is|speaking with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
        if (nameMatch && nameMatch[1]) {
          const candidate = nameMatch[1].trim();
          if (!['good', 'fine', 'selling', 'interested', 'calling', 'the', 'not', 'ready', 'open', 'sure', 'yes'].includes(candidate.toLowerCase())) {
            updated.sellerName = candidate;
            break;
          }
        }
      }
    }

    // 2. Extract Property Details (Bedrooms, Bathrooms, House Specs, e.g. "2 bedroom 2 bathrooms", "3 bed 2 bath ranch")
    for (const text of userTexts) {
      const lower = text.toLowerCase();
      // Match patterns like "3 bedroom 2 bathroom", "3 bed 2 bath", "two bedroom two bathrooms", "4 beds 3 baths"
      const bedBathRegex = /(?:(\d+|one|two|three|four|five|six)\s*(?:bed|bedroom|bedrooms|br)\s*(?:and|&|,)?\s*(\d+|one|two|three|four|five|six|\.5)?\s*(?:bath|bathroom|bathrooms|ba)?(?:[a-zA-Z\s,]{0,30}))/i;
      const match = text.match(bedBathRegex);
      if (match && match[0]) {
        let extractedDetails = match[0].trim();
        // Capitalize nicely
        extractedDetails = extractedDetails.charAt(0).toUpperCase() + extractedDetails.slice(1);
        updated.propertyDetails = extractedDetails;
        break;
      } else if (lower.includes('bedroom') || lower.includes('bath') || lower.includes('sqft') || lower.includes('square feet')) {
        updated.propertyDetails = text.trim();
        break;
      }
    }

    // 3. Extract Scheduled Callback Time / Appointment
    for (const text of userTexts) {
      const lower = text.toLowerCase();
      if (
        lower.includes('tomorrow') ||
        lower.includes('pm') ||
        lower.includes('am') ||
        lower.includes("o'clock") ||
        lower.includes('afternoon') ||
        lower.includes('morning') ||
        lower.includes('monday') ||
        lower.includes('tuesday') ||
        lower.includes('wednesday') ||
        lower.includes('thursday') ||
        lower.includes('friday') ||
        lower.includes('saturday') ||
        lower.includes('sunday') ||
        lower.includes('callback') ||
        lower.includes('follow up')
      ) {
        // Extract time phrase
        const timeMatch = text.match(/(?:(?:tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*(?:morning|afternoon|evening|night)?\s*(?:at\s*)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm|o'clock)?)?)/i);
        if (timeMatch && timeMatch[0] && timeMatch[0].trim().length > 3) {
          updated.callbackTime = text.trim();
          break;
        }
      }
    }

    // 4. Extract Property Address
    if (!updated.propertyAddress || updated.propertyAddress.includes('Pending')) {
      for (const text of userTexts) {
        const addressMatch = text.match(/\b\d{1,5}\s+[A-Za-z0-9\s.,]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Circle|Cir|Terrace|Place|Pl)\b/i);
        if (addressMatch) {
          updated.propertyAddress = addressMatch[0].trim();
          break;
        } else if (text.toLowerCase().includes('in ') || text.toLowerCase().includes('at ')) {
          const locMatch = text.match(/(?:in|at)\s+([0-9A-Za-z\s]{5,35}(?:Springfield|Austin|Dallas|Miami|Denver|Atlanta|Houston|Phoenix|[A-Z][a-z]+))/);
          if (locMatch && locMatch[1]) {
            updated.propertyAddress = locMatch[1].trim();
          }
        }
      }
    }

    // 5. Extract Property Type
    if (lowerAll.includes('duplex') || lowerAll.includes('triplex') || lowerAll.includes('multi family') || lowerAll.includes('units')) {
      updated.propertyType = 'Multi Family';
    } else if (lowerAll.includes('condo') || lowerAll.includes('townhouse') || lowerAll.includes('townhome')) {
      updated.propertyType = 'Condo/Townhouse';
    } else if (lowerAll.includes('single family') || lowerAll.includes('house') || lowerAll.includes('home') || lowerAll.includes('ranch')) {
      updated.propertyType = 'Single Family';
    } else if (lowerAll.includes('commercial') || lowerAll.includes('retail') || lowerAll.includes('warehouse')) {
      updated.propertyType = 'Commercial';
    }

    // 6. Extract Condition & Repairs
    if (lowerAll.includes('fixer') || lowerAll.includes('gut') || lowerAll.includes('heavy') || lowerAll.includes('trashed') || lowerAll.includes('abandoned')) {
      updated.condition = 'Distressed';
    } else if (lowerAll.includes('repair') || lowerAll.includes('work') || lowerAll.includes('tlc') || lowerAll.includes('old') || lowerAll.includes('80s') || lowerAll.includes('roof') || lowerAll.includes('hvac')) {
      updated.condition = 'Needs Minor TLC';
    } else if (lowerAll.includes('good shape') || lowerAll.includes('great shape') || lowerAll.includes('move-in') || lowerAll.includes('renovated') || lowerAll.includes('new roof') || lowerAll.includes('updated')) {
      updated.condition = 'Move-in Ready';
    }

    // 7. Extract Timeline
    if (lowerAll.includes('immediate') || lowerAll.includes('this week') || lowerAll.includes('this month') || lowerAll.includes('3 weeks') || lowerAll.includes('asap') || lowerAll.includes('30 days') || lowerAll.includes('fast') || lowerAll.includes('45 days')) {
      updated.timeline = 'Immediate (0-30 days)';
    } else if (lowerAll.includes('1-3') || lowerAll.includes('couple months') || lowerAll.includes('next month') || lowerAll.includes('60 days')) {
      updated.timeline = '1-3 Months';
    } else if (lowerAll.includes('3-6') || lowerAll.includes('few months') || lowerAll.includes('by summer') || lowerAll.includes('by end of year')) {
      updated.timeline = '3-6 Months';
    } else if (lowerAll.includes('not in a rush') || lowerAll.includes('just looking') || lowerAll.includes('exploring') || lowerAll.includes('depends on offer')) {
      updated.timeline = 'Just Exploring';
    }

    // 8. Extract Reason for Selling (Motivation)
    if (!updated.reasonForSelling || updated.reasonForSelling.includes('Pending')) {
      if (lowerAll.includes('relocat') || lowerAll.includes('job transfer') || lowerAll.includes('moving')) {
        updated.reasonForSelling = 'Relocating for job';
      } else if (lowerAll.includes('inherit') || lowerAll.includes('estate') || lowerAll.includes('probate')) {
        updated.reasonForSelling = 'Inherited / Estate property';
      } else if (lowerAll.includes('tenant') || lowerAll.includes('landlord') || lowerAll.includes('tired of renting')) {
        updated.reasonForSelling = 'Tired landlord / Tenant fatigue';
      } else if (lowerAll.includes('downsize') || lowerAll.includes('too big') || lowerAll.includes('retire')) {
        updated.reasonForSelling = 'Downsizing / Retirement';
      } else if (lowerAll.includes('cash') || lowerAll.includes('bills') || lowerAll.includes('foreclosure')) {
        updated.reasonForSelling = 'Financial / Quick cash equity';
      }
    }

    // 9. Extract Asking Price
    if (!updated.askingPrice || updated.askingPrice.includes('Pending')) {
      const priceMatch = fullUserDialogue.match(/\$(?:[0-9]{1,3},?)+(?:k|K|,\d{3})?|\b\d{2,4}\s*(?:k|K|thousand|hundred thousand)\b|\b(?:around|about|close to|under|over)\s*\$?\d{2,4}k?\b|\b(?:\d{1,3}\s*(?:million|m))\b/i);
      if (priceMatch) {
        updated.askingPrice = priceMatch[0].trim();
      }
    }

    // 10. Extract dynamic custom variable tags present in active nodes
    if (nodes && nodes.length > 0) {
      if (!updated.customFields) {
        updated.customFields = {};
      }
      for (const node of nodes) {
        const matches = node.agentPrompt.matchAll(/\{\{([a-zA-Z0-9_\s-]+)\}\}/g);
        for (const m of matches) {
          const varName = m[1].trim().toLowerCase();
          // Skip standard recognized keys handled above
          if (
            ['client_name', 'client names', 'seller_name', 'property_details', 'property specs', 'callback_time', 'asking_price', 'timeline', 'condition', 'property_address'].includes(varName)
          ) {
            continue;
          }

          if (updated.customFields[varName]) {
            continue;
          }

          // Heuristic 1: Node-scoped user reply
          const nodeUserMessages = messages.filter((msg) => msg.sender === 'user' && msg.currentNodeId === node.id);
          const nodeText = nodeUserMessages.map((msg) => msg.text).join(' ');

          // Target text to inspect (scoped node text if present, or all user dialogue)
          const searchTarget = nodeText.trim() || fullUserDialogue;

          // Heuristic 2: Email Pattern
          if (varName.includes('email') || varName.includes('mail')) {
            const emailMatch = searchTarget.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            if (emailMatch) {
              updated.customFields[varName] = emailMatch[0];
              continue;
            }
          }

          // Heuristic 3: Financial / Currency (rent, loan, mortgage, amount, equity)
          if (
            varName.includes('rent') ||
            varName.includes('loan') ||
            varName.includes('mortgage') ||
            varName.includes('balance') ||
            varName.includes('amount') ||
            varName.includes('equity')
          ) {
            const moneyMatch = searchTarget.match(/\$(?:[0-9]{1,3},?)+(?:k|K|\/mo|\/month)?|\b\d{2,5}\s*(?:dollars|bucks|k|a month|\/month)\b/i);
            if (moneyMatch) {
              updated.customFields[varName] = moneyMatch[0].trim();
              continue;
            }
          }

          // Heuristic 4: Square footage / Size / Lot
          if (varName.includes('sqft') || varName.includes('square') || varName.includes('size') || varName.includes('footage')) {
            const sqftMatch = searchTarget.match(/\b\d{1,5}\s*(?:sq\s*ft|sqft|square feet|acres?)\b/i);
            if (sqftMatch) {
              updated.customFields[varName] = sqftMatch[0].trim();
              continue;
            }
          }

          // Heuristic 5: Roof Age / Years
          if (varName.includes('roof') || varName.includes('age') || varName.includes('year')) {
            const ageMatch = searchTarget.match(/\b\d{1,2}\s*(?:years?|yrs?|months?)\s*(?:old|ago)?\b|\b(?:19|20)\d{2}\b/i);
            if (ageMatch) {
              updated.customFields[varName] = ageMatch[0].trim();
              continue;
            }
          }

          // Heuristic 6: Occupancy / Tenant Status
          if (varName.includes('tenant') || varName.includes('occup') || varName.includes('rented')) {
            if (searchTarget.toLowerCase().includes('vacant') || searchTarget.toLowerCase().includes('empty')) {
              updated.customFields[varName] = 'Vacant / Unoccupied';
              continue;
            } else if (searchTarget.toLowerCase().includes('tenant') || searchTarget.toLowerCase().includes('rented') || searchTarget.toLowerCase().includes('leased')) {
              updated.customFields[varName] = 'Tenant Occupied / Leased';
              continue;
            } else if (searchTarget.toLowerCase().includes('owner') || searchTarget.toLowerCase().includes('live here')) {
              updated.customFields[varName] = 'Owner Occupied';
              continue;
            }
          }

          // Fallback: Use latest user text in that node turn
          if (nodeUserMessages.length > 0) {
            updated.customFields[varName] = nodeUserMessages[nodeUserMessages.length - 1].text.trim();
          }
        }
      }
    }

    // 11. Calculate Dynamic Qualification Score & Deal Status
    let score = 0;
    if (updated.sellerName && !updated.sellerName.includes('Pending')) score += 15;
    if (updated.propertyDetails) score += 25;
    if (updated.propertyAddress && !updated.propertyAddress.includes('Pending')) score += 20;
    if (updated.condition !== 'Unknown') score += 10;
    if (updated.timeline !== 'Unknown') score += 10;
    if (updated.askingPrice && !updated.askingPrice.includes('Pending')) score += 10;
    if (updated.callbackTime) score += 10;

    updated.qualificationScore = Math.min(score, 100);

    if (score >= 70 || updated.callbackTime) {
      updated.dealStatus = 'Hot Lead';
    } else if (score >= 40) {
      updated.dealStatus = 'Warm Follow-Up';
    } else {
      updated.dealStatus = 'Nurture';
    }

    updated.extractedAt = new Date().toLocaleString();
    return updated;
  }

  /**
   * Export single or multiple leads into a clean, downloadable CSV file
   */
  static downloadLeadCsv(lead: QualifiedLead, allHistory?: QualifiedLead[]): void {
    const leadsToExport = allHistory && allHistory.length > 0 ? allHistory : [lead];

    const headers = [
      'Record ID',
      'Extraction Timestamp',
      'Client / Seller Name',
      'Phone Number',
      'Property Details (Bed/Bath Specs)',
      'Property Address',
      'Property Type',
      'Condition & Repairs',
      'Asking / Ballpark Price',
      'Scheduled Callback Time',
      'Selling Timeline',
      'Seller Motivation',
      'Qualification Score',
      'Deal Status',
      'Custom Extracted Slots',
    ];

    const rows = leadsToExport.map((item, idx) => {
      const customSlotsStr = item.customFields
        ? Object.entries(item.customFields)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' | ')
        : '';

      return [
        `LEAD-${Date.now().toString().slice(-4)}-${idx + 1}`,
        `"${item.extractedAt || new Date().toLocaleString()}"`,
        `"${(item.sellerName || 'N/A').replace(/"/g, '""')}"`,
        `"${item.phone || '(555) 382-9104'}"`,
        `"${(item.propertyDetails || 'N/A').replace(/"/g, '""')}"`,
        `"${(item.propertyAddress || 'N/A').replace(/"/g, '""')}"`,
        `"${item.propertyType || 'Unknown'}"`,
        `"${item.condition || 'Unknown'}"`,
        `"${(item.askingPrice || 'N/A').replace(/"/g, '""')}"`,
        `"${(item.callbackTime || 'N/A').replace(/"/g, '""')}"`,
        `"${item.timeline || 'Unknown'}"`,
        `"${(item.reasonForSelling || 'N/A').replace(/"/g, '""')}"`,
        `"${item.qualificationScore}%"`,
        `"${item.dealStatus}"`,
        `"${customSlotsStr.replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const cleanClientName = (lead.sellerName || 'Client').replace(/[^a-zA-Z0-9]/g, '_');
    link.setAttribute('href', url);
    link.setAttribute('download', `Apex_Voice_Lead_${cleanClientName}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Generates a real-time Slot Blackboard summary string for LLM Context Injection
   */
  static generateBlackboardSummary(
    messages: ChatMessage[],
    activeNode: FlowNode | null,
    allNodes: FlowNode[]
  ): string {
    const defaultLead: QualifiedLead = {
      sellerName: '',
      phone: '',
      propertyAddress: '',
      propertyType: 'Single Family',
      propertyDetails: '',
      condition: 'Unknown',
      askingPrice: '',
      timeline: 'Unknown',
      reasonForSelling: '',
      callbackTime: '',
      qualificationScore: 50,
      dealStatus: 'Warm Follow-Up',
      customFields: {},
    };

    const lead = LeadExtractor.extractLeadInfo(messages, defaultLead, allNodes);

    let summary = `=== LIVE CALL DATA BLACKBOARD (CURRENT MEMORY) ===\n`;
    summary += `- Seller/Client Name: ${lead.sellerName ? `"${lead.sellerName}"` : '[MISSING]'}\n`;
    summary += `- Property Address: ${lead.propertyAddress ? `"${lead.propertyAddress}"` : '[MISSING]'}\n`;
    summary += `- Property Specs (Beds/Baths): ${lead.propertyDetails ? `"${lead.propertyDetails}"` : '[MISSING]'}\n`;
    summary += `- Property Condition/Repairs: ${lead.condition && lead.condition !== 'Unknown' ? `"${lead.condition}"` : '[MISSING]'}\n`;
    summary += `- Asking Price / Ballpark: ${lead.askingPrice ? `"${lead.askingPrice}"` : '[MISSING]'}\n`;
    summary += `- Closing Timeline: ${lead.timeline && lead.timeline !== 'Unknown' ? `"${lead.timeline}"` : '[MISSING]'}\n`;
    summary += `- Callback / Appointment Time: ${lead.callbackTime ? `"${lead.callbackTime}"` : '[MISSING]'}\n`;

    if (lead.customFields && Object.keys(lead.customFields).length > 0) {
      summary += `- Custom Extracted Variables:\n`;
      Object.entries(lead.customFields).forEach(([k, v]) => {
        summary += `  * {{${k}}}: "${v}"\n`;
      });
    }

    if (activeNode) {
      summary += `\n=== CURRENT STEP CONTEXT ===\n`;
      summary += `Active Node: "${activeNode.title}" (ID: "${activeNode.id}")\n`;
      if (activeNode.transitions && activeNode.transitions.length > 0) {
        summary += `Connected Outgoing Routes:\n`;
        activeNode.transitions.forEach((t, i) => {
          const target = allNodes.find((n) => n.id === t.targetNodeId);
          summary += `  ${i + 1}. When user intent matches "${t.label}" (${t.conditionText || t.label}) -> Route to "${target?.title || t.targetNodeId}" [NEXT_NODE: ${t.targetNodeId}]\n`;
        });
      }
    }

    return summary.trim();
  }

  /**
   * Save lead to persistent local storage history
   */
  static saveLeadToHistory(lead: QualifiedLead): void {
    try {
      const existing = localStorage.getItem('apex_voice_crm_history');
      const leads: QualifiedLead[] = existing ? JSON.parse(existing) : [];
      const newLead: QualifiedLead = {
        ...lead,
        id: `lead-${Date.now()}`,
        extractedAt: new Date().toLocaleString(),
      };
      leads.unshift(newLead);
      localStorage.setItem('apex_voice_crm_history', JSON.stringify(leads.slice(0, 50)));
    } catch (err) {
      console.warn('Could not save lead to history:', err);
    }
  }

  /**
   * Retrieve all saved lead history
   */
  static getLeadHistory(): QualifiedLead[] {
    try {
      const existing = localStorage.getItem('apex_voice_crm_history');
      return existing ? JSON.parse(existing) : [];
    } catch {
      return [];
    }
  }
}
