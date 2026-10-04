import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Page } from '../models/portal.models';
import { CardLayout, WarrantyDesign, WarrantyPack, WarrantyPrintSheet } from '../models/warranty-cards.models';

export type CardSide = 'front' | 'back';

/** Warranty card designs and printed packs for SynkMart shops. */
@Injectable({ providedIn: 'root' })
export class WarrantyCardsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/warranty-cards`;

  /** Design pictures come back as API paths. */
  imageUrl(path: string | null): string | null {
    return path ? `${environment.apiBaseUrl}${path}` : null;
  }

  designs(): Observable<WarrantyDesign[]> {
    return this.http.get<WarrantyDesign[]>(`${this.base}/designs`);
  }

  createDesign(body: Partial<CardLayout> & { name: string }): Observable<WarrantyDesign> {
    return this.http.post<WarrantyDesign>(`${this.base}/designs`, body);
  }

  updateDesign(id: string, body: Partial<CardLayout> & { name?: string }): Observable<WarrantyDesign> {
    return this.http.patch<WarrantyDesign>(`${this.base}/designs/${id}`, body);
  }

  deleteDesign(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/designs/${id}`);
  }

  uploadImage(id: string, side: CardSide, image: Blob): Observable<WarrantyDesign> {
    const form = new FormData();
    form.append('image', image, `${side}.${image.type === 'image/png' ? 'png' : image.type === 'image/jpeg' ? 'jpg' : 'webp'}`);
    return this.http.post<WarrantyDesign>(`${this.base}/designs/${id}/${side}`, form);
  }

  removeImage(id: string, side: CardSide): Observable<WarrantyDesign> {
    return this.http.delete<WarrantyDesign>(`${this.base}/designs/${id}/${side}`);
  }

  packs(query: { status?: string; q?: string; page?: number; pageSize?: number }): Observable<Page<WarrantyPack>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Page<WarrantyPack>>(`${this.base}/packs`, { params });
  }

  createPacks(body: { designId: string; packCount: number; cardsPerPack: number }): Observable<{ runId: string; packCount: number; cardCount: number }> {
    return this.http.post<{ runId: string; packCount: number; cardCount: number }>(`${this.base}/packs`, body);
  }

  voidPack(id: string, reason: string): Observable<WarrantyPack> {
    return this.http.post<WarrantyPack>(`${this.base}/packs/${id}/void`, { reason });
  }

  printSheet(query: { runId?: string; packId?: string }): Observable<WarrantyPrintSheet> {
    let params = new HttpParams();
    if (query.runId) params = params.set('runId', query.runId);
    if (query.packId) params = params.set('packId', query.packId);
    return this.http.get<WarrantyPrintSheet>(`${this.base}/print`, { params });
  }
}
